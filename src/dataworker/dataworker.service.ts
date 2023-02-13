import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { BigNumber } from "ethers";
import axios from "axios";
import { last } from "lodash";
import { Erc20Contract, LpSub2SubBridgeContract } from "../base/contract";
import { EthereumConnectedWallet } from "../base/wallet";
import { EthereumProvider, GasPrice } from "../base/provider";
import { Ether, GWei, EtherBigNumber } from "../base/bignumber";
import { PriceOracle } from "../base/oracle";

export interface HistoryRecord {
  id: string;
  messageNonce: string;
  sendTokenAddress: string;
  recvTokenAddress: string;
  recvToken: string;
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
  private readonly logger = new Logger("dataworker");
  private readonly statusPending = 0;
  private readonly finalizeBlocks = 8;
  private readonly zeroAddress = "0x0000000000000000000000000000000000000000";
  private readonly relayGasLimit = 100000;

  async onModuleInit() {
    this.logger.log("data worker started");
  }

  getTransferId(id: string): string {
    return last(id.split("-"));
  }

  getChainId(id: string): string {
    return id.split("-")[1];
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
    const fromChain = fromChains.map((item) => `${item}`).join(",");
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
            ) {records {id, messageNonce, sendTokenAddress, recvTokenAddress, recvToken, sender, recipient, sendAmount, fromChain, reason, fee, requestTxHash}}}`;
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
    minProfit: Ether,
    fromProvider: EthereumProvider,
    toProvider: EthereumProvider,
    priceOracle: PriceOracle.TokenPriceOracle,
    userFeeToken: string,
    relayerGasFeeToken: string
  ): Promise<ProfitableInfo> {
    // 1. tx must be finalized
    const transactionInfo = await fromProvider.checkPendingTransaction(
      record.requestTxHash
    );
    if (
      !transactionInfo ||
      transactionInfo.confirmedBlock < this.finalizeBlocks
    ) {
      this.logger.log(
        `request tx waiting finalize ${transactionInfo.confirmedBlock}, hash: ${record.requestTxHash}`
      );
      return {
        gasPrice: null,
        result: false,
      };
    }
    // 2. tx is not relayed
    const transferId = this.getTransferId(record.id);
    const relayer = await toBridge.issuedMessages(transferId);
    if (relayer != this.zeroAddress) {
      this.logger.log(
        `tx has been relayed, waiting for sync, id ${transferId}`
      );
      return {
        gasPrice: null,
        result: false,
      };
    }
    // 3. fee satisfy profit
    let gasPrice = await toProvider.feeData();
    let feeUsed: BigNumber;
    if (gasPrice.isEip1559) {
      let maxFeePerGas = new GWei(gasPrice.eip1559fee.maxFeePerGas).mul(1.1).Number;
      const maxPriorityFeePerGas = new GWei(
          gasPrice.eip1559fee.maxPriorityFeePerGas
      ).mul(1.1).Number
      if (maxFeePerGas.lt(maxPriorityFeePerGas)) {
          maxFeePerGas = maxPriorityFeePerGas;
      }
      gasPrice.eip1559fee = {
        maxFeePerGas,
        maxPriorityFeePerGas,
      };
      feeUsed = gasPrice.eip1559fee.maxFeePerGas.mul(this.relayGasLimit);
    } else {
      gasPrice.fee.gasPrice = new GWei(gasPrice.fee.gasPrice).mul(1.1).Number;
      feeUsed = gasPrice.fee.gasPrice.mul(this.relayGasLimit);
    }
    const swapOut = await priceOracle.simulateSwap(
      userFeeToken,
      relayerGasFeeToken,
      new EtherBigNumber(record.fee).Number
    );
    const thePrice = feeUsed.div(this.relayGasLimit).div(1e9);
    if (swapOut.lt(feeUsed.add(minProfit.Number))) {
      this.logger.log(`fee is not enough, swapOut ${swapOut}, feeUsed ${feeUsed}, gasPrice ${thePrice}`);
      return {
        gasPrice,
        result: false,
      };
    }
    this.logger.log(`fee check passed, swapOut ${swapOut}, feeUsed ${feeUsed}, gasPrice ${thePrice}`);
    return {
      gasPrice,
      result: true,
    };
  }
}
