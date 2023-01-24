import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BigNumber } from "ethers";
import axios from 'axios';
import { last } from 'lodash';
import { Erc20Contract, LpSub2SubBridgeContract } from "../base/contract";
import { EthereumConnectedWallet } from "../base/wallet";
import { EthereumProvider, GasPrice } from "../base/provider";
import { Ether, GWei, EtherBigNumber } from "../base/bignumber";
import { UniswapTokenRate, TokenRate } from "../base/token.rate";

export interface HistoryRecord {
    id: string;
    messageNonce: string;
    sendTokenAddress: string;
    recvTokenAddress: string;
    sender: string;
    recipient: string;
    sendAmount: string;
    fromChain: string;
    reason: string;
    fee: string;
    requestTxHash: string;
}

export interface ProfitableInfo {
    gasPrice: GasPrice | null;
    result: boolean;
}

@Injectable()
export class DataworkerService implements OnModuleInit {
    private readonly logger = new Logger('dataworker');
    private readonly statusPending = 0;
    private readonly finalizeBlocks = 8;
    private readonly zeroAddress = '0x0000000000000000000000000000000000000000';
    private readonly relayGasLimit = 100000;
    private readonly tokenRate: TokenRate = new UniswapTokenRate();
    async onModuleInit() {
        this.logger.log("data worker started");
    }

    getTransferId(id: string): string {
        return last(id.split('-'));
    }

    getChainId(id: string): string {
        return id.split('-')[1];
    }

    // query record from apollo
    async queryRecordNeedRelay(
        url: string,
        fromChains: string[],
        toChain: string,
        recvTokenAddress: string,
        row: number,
        page: number
    ): Promise<[HistoryRecord]> {
        const fromChain = fromChains.map((item) => `${item}`).join(',');
        const query = `query {
            historyRecords(
                fromChains: [\"${fromChain}\"],
                toChains: [\"${toChain}\"],
                bridges: [\"lpbridge-${fromChain}\"],
                results: [${this.statusPending}],
                recvTokenAddress: \"${recvTokenAddress}\",
                row: ${row},
                page: ${page},
                order: "fee"
            ) {records {id, messageNonce, sendTokenAddress, recvTokenAddress, sender, recipient, sendAmount, fromChain, reason, fee, requestTxHash}}}`;
        const records = await axios
        .post(url, {
            query,
            variables: null,
        })
        .then((res) => res.data.data.historyRecords);
        return records.records;
    }

    async checkProfitable(
        record: HistoryRecord,
        toBridge: LpSub2SubBridgeContract,
        fromProvider: EthereumProvider,
        toProvider: EthereumProvider
    ): Promise<ProfitableInfo> {
        // 1. tx must be finalized
        const confirmedBlocks = await fromProvider.checkPendingTransaction(record.requestTxHash);
        if (confirmedBlocks < this.finalizeBlocks) {
            this.logger.log(`request tx waiting finalize ${confirmedBlocks}, hash: ${record.requestTxHash}`);
            return {
                gasPrice: null,
                result: false,
            };
        }
        // 2. tx is not relayed
        const transferId = this.getTransferId(record.id);
        const relayer = await toBridge.issuedMessages(transferId);
        if (relayer != this.zeroAddress) {
            return {
                gasPrice: null,
                result: false,
            };
        }
        // 3. fee satisfy profit
        let gasPrice = await toProvider.feeData();
        let feeUsed: BigNumber;
        if (gasPrice.isEip1559) {
            gasPrice.eip1559fee = {
                maxFeePerGas: (new GWei(gasPrice.eip1559fee.maxFeePerGas)).mul(1.2).Number,
                maxPriorityFeePerGas: (new GWei(gasPrice.eip1559fee.maxPriorityFeePerGas)).mul(1.2).Number,
            };
            feeUsed = gasPrice.eip1559fee.maxFeePerGas.mul(this.relayGasLimit);
        } else {
            gasPrice.fee.gasPrice = (new GWei(gasPrice.fee.gasPrice)).mul(1.2).Number;
            feeUsed = gasPrice.fee.gasPrice.mul(this.relayGasLimit);
        }
        const swapOut = this.tokenRate.simulateNativeSwap(
            record.recvTokenAddress,
            (new EtherBigNumber(record.sendAmount)).Number
        );
        if (swapOut.lt(feeUsed.mul(2))) {
            return {
                gasPrice,
                result: false,
            };
        }
        return {
            gasPrice,
            result: true,
        };
    }
}

