import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import axios from "axios";
import { last } from "lodash";
import {
  Erc20Contract,
  LnBridgeContract,
  Lnv3BridgeContract,
  zeroTransferId,
} from "../base/contract";
import { EthereumConnectedWallet } from "../base/wallet";
import { EthereumProvider, GasPrice } from "../base/provider";
import { Ether, GWei, EtherBigNumber } from "../base/bignumber";

export interface HistoryRecord {
  id: string;
  startTime: number;
  sendTokenAddress: string;
  recvToken: string;
  sender: string;
  recipient: string;
  sendAmount: string;
  recvAmount: string;
  fromChain: string;
  toChain: string;
  reason: string;
  fee: string;
  requestTxHash: string;
  confirmedBlocks: string;
  messageNonce: number;
}

export interface ValidInfo {
  gasPrice: GasPrice | null;
  feeUsed: bigint | null;
  isValid: boolean;
}

export interface TransferRecord {
  lastTransferId: string;
  record: HistoryRecord;
}

@Injectable()
export class DataworkerService implements OnModuleInit {
  private readonly logger = new Logger("dataworker");
  private readonly statusPending = 0;
  private readonly statusSuccess = 3;
  private readonly statusRefund = 4;
  private readonly pendingToConfirmRefund = 5;
  private readonly relayGasLimit = BigInt(100000);

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
    fromChain: string,
    toChain: string,
    relayer: string,
    token: string,
    bridgeType: string
  ): Promise<TransferRecord | null> {
    let firstPendingOrderBy = bridgeType === "lnv3" ? "nonce_asc" : "messageNonce_asc";
    let lastSuccessOrderBy = bridgeType === "lnv3" ? "nonce_desc" : "messageNonce_desc";
    // query first pending tx
    let query = `{
            firstHistoryRecord(
                fromChain: \"${fromChain}\",
                toChain: \"${toChain}\",
                bridge: \"${bridgeType}\",
                results: [${this.statusPending}],
                relayer: \"${relayer.toLowerCase()}\",
                token: \"${token.toLowerCase()}\",
                order: "${firstPendingOrderBy}"
            ) {id, startTime, sendTokenAddress, recvToken, sender, recipient, sendAmount, recvAmount, fromChain, toChain, reason, fee, requestTxHash, confirmedBlocks, messageNonce}}`;
    const pendingRecord = await axios
      .post(url, {
        query,
        variables: {},
        operationName: null,
      })
      .then((res) => res.data.data.firstHistoryRecord);
    if (pendingRecord === null) {
      return null;
    }

    if (bridgeType === "lnv3") {
      return {
        lastTransferId: null,
        record: pendingRecord,
      };
    }

    // query the first successed record
    query = `query {
            firstHistoryRecord(
                fromChain: \"${fromChain}\",
                toChain: \"${toChain}\",
                bridge: \"${bridgeType}\",
                results: [${this.statusSuccess}, ${this.statusRefund}, ${
      this.pendingToConfirmRefund
    }],
                relayer: \"${relayer.toLowerCase()}\",
                token: \"${token.toLowerCase()}\",
                order: "${lastSuccessOrderBy}"
            ) {id}}`;
    const lastRecord = await axios
      .post(url, {
        query,
        variables: null,
      })
      .then((res) => res.data.data.firstHistoryRecord);

    const lastTransferId =
      lastRecord === null ? zeroTransferId : last(lastRecord.id.split("-"));
    return {
      lastTransferId: lastTransferId,
      record: pendingRecord,
    };
  }

  relayFee(gasPrice: GasPrice): bigint {
    let feeUsed: bigint;
    if (gasPrice.isEip1559) {
      let maxFeePerGas = new GWei(gasPrice.eip1559fee.maxFeePerGas).mul(
        1.05
      ).Number;
      const maxPriorityFeePerGas = new GWei(
          gasPrice.eip1559fee.maxPriorityFeePerGas
      ).mul(1.1).Number
      if (maxFeePerGas < maxPriorityFeePerGas) {
          maxFeePerGas = maxPriorityFeePerGas;
      }
      gasPrice.eip1559fee = {
        maxFeePerGas,
        maxPriorityFeePerGas,
      };
      feeUsed = gasPrice.eip1559fee.maxFeePerGas * this.relayGasLimit;
    } else {
      gasPrice.fee.gasPrice = new GWei(gasPrice.fee.gasPrice).mul(1.05).Number;
      feeUsed = gasPrice.fee.gasPrice * this.relayGasLimit;
    }
    return feeUsed;
  }

  async updateConfirmedBlock(
    url: string,
    id: string,
    block: number,
    reorgThreshold: number
  ) {
    const mutation = `mutation {updateConfirmedBlock( id: \"${id}\", block: \"${block}/${reorgThreshold}\")}`;
    await axios.post(url, {
      query: mutation,
      variables: null,
    });
  }

  async sendHeartBeat(
    url: string,
    fromChainId: number,
    toChainId: number,
    relayer: string,
    tokenAddress: string,
    version: string
  ) {
    if (version !== 'lnv3') {
      version = 'lnv2';
    }
    const mutation = `mutation {lnBridgeHeartBeat( version: \"${version}\", fromChainId: \"${fromChainId}\", toChainId: \"${toChainId}\", relayer: \"${relayer}\", tokenAddress: \"${tokenAddress}\")}`;
    await axios.post(url, {
      query: mutation,
      variables: null,
    });
  }

  async checkValid(
    url: string,
    record: HistoryRecord,
    fromBridge: LnBridgeContract | Lnv3BridgeContract,
    toBridge: LnBridgeContract | Lnv3BridgeContract,
    fromProvider: EthereumProvider,
    toProvider: EthereumProvider,
    reorgThreshold: number,
    notSupport1559: boolean
  ): Promise<ValidInfo> {
    // 1. tx must be finalized
    const transactionInfo = await fromProvider.checkPendingTransaction(
      record.requestTxHash
    );
    if (!transactionInfo || transactionInfo.confirmedBlock < reorgThreshold) {
      this.logger.log(
        `request tx waiting finalize ${transactionInfo.confirmedBlock}, hash: ${record.requestTxHash}`
      );
      // update confirmed block
      const confirmedBlock =
        record.confirmedBlocks === ""
          ? 0
          : Number(record.confirmedBlocks.split("/")[0]);
      if (transactionInfo.confirmedBlock > confirmedBlock) {
        await this.updateConfirmedBlock(
          url,
          record.id,
          transactionInfo.confirmedBlock,
          reorgThreshold
        );
      }
      return {
        gasPrice: null,
        feeUsed: null,
        isValid: false,
      };
    }
    // 2. tx is not relayed
    const transferId = this.getTransferId(record.id);
    const transferFilled = await toBridge.transferHasFilled(transferId);
    if (transferFilled) {
      this.logger.log(
        `[${record.fromChain}>>${record.toChain}]tx has been relayed, waiting for sync, id ${transferId}, txHash ${record.requestTxHash}`
      );
      return {
        gasPrice: null,
        feeUsed: null,
        isValid: false,
      };
    }
    // 3. the lock info verify
    const existInfo = await fromBridge.transferIdExist(transferId);
    if (!existInfo[0]) {
      this.logger.log(`lock info not exist, maybe reorged, id ${transferId}`);
      return {
        gasPrice: null,
        feeUsed: null,
        isValid: false,
      };
    } else {
      this.logger.log(`transfer locked success, info ${existInfo[1]}`);
    }
    // 4. get current fee
    let gasPrice = await toProvider.feeData(1, notSupport1559);
    let feeUsed = this.relayFee(gasPrice);
    this.logger.log(`fee check passed, feeUsed ${feeUsed}`);
    return {
      gasPrice,
      feeUsed,
      isValid: true,
    };
  }
}
