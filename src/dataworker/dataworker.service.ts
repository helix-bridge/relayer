import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { BigNumber } from "ethers";
import axios from "axios";
import { last } from "lodash";
import {
    Erc20Contract,
    LnBridgeTargetContract,
    LnBridgeSourceContract,
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
  fromChain: string;
  reason: string;
  fee: string;
  requestTxHash: string;
}

export interface ValidInfo {
  gasPrice: GasPrice | null;
  feeUsed: BigNumber | null;
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
  private readonly finalizeBlocks = 8;
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
    fromChain: string,
    toChain: string,
    relayer: string,
    token: string
  ): Promise<TransferRecord | null> {
    // query first pending tx
    let query = `{
            firstHistoryRecord(
                fromChain: \"${fromChain}\",
                toChain: \"${toChain}\",
                bridge: \"lnbridgev20\",
                results: [${this.statusPending}],
                relayer: \"${relayer.toLowerCase()}\",
                token: \"${token.toLowerCase()}\",
                order: "startTime_asc"
            ) {id, startTime, sendTokenAddress, recvToken, sender, recipient, sendAmount, fromChain, reason, fee, requestTxHash}}`;
    const pendingRecord = await axios
      .post(url, {
        query,
        variables: {},
        operationName: null,
      })
      .then((res) => res.data.data.firstHistoryRecord);
    if (pendingRecord === null) {
      return null
    }

    // query the first successed record
    query = `query {
            firstHistoryRecord(
                fromChain: \"${fromChain}\",
                toChain: \"${toChain}\",
                bridge: \"lnbridgev20\",
                results: [${this.statusSuccess}, ${this.statusRefund}, ${this.pendingToConfirmRefund}],
                relayer: \"${relayer.toLowerCase()}\",
                token: \"${token.toLowerCase()}\",
                order: "startTime_desc"
            ) {id}}`;
    const lastRecord = await axios
      .post(url, {
        query,
        variables: null,
      })
      .then((res) => res.data.data.firstHistoryRecord);

    const lastTransferId = lastRecord === null ? zeroTransferId : last(lastRecord.id.split('-'));
    return {
      lastTransferId: lastTransferId,
      record: pendingRecord,
    }
  }

  relayFee(gasPrice: GasPrice): BigNumber {
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
    return feeUsed;
  }

  async checkValid(
    record: HistoryRecord,
    fromBridge: LnBridgeSourceContract,
    toBridge: LnBridgeTargetContract,
    fromProvider: EthereumProvider,
    toProvider: EthereumProvider
  ): Promise<ValidInfo> {
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
        feeUsed: null,
        isValid: false,
      };
    }
    // 2. tx is not relayed
    const transferId = this.getTransferId(record.id);
    const fillTransfer = await toBridge.fillTransfers(transferId);
    if (fillTransfer != zeroTransferId) {
      this.logger.log(
        `tx has been relayed, waiting for sync, id ${transferId}, fillinfo ${fillTransfer}`
      );
      return {
        gasPrice: null,
        feeUsed: null,
        isValid: false,
      };
    }
    // 3. get current fee
    let gasPrice = await toProvider.feeData();
    let feeUsed = this.relayFee(gasPrice);
    this.logger.log(`fee check passed, feeUsed ${feeUsed}`);
    return {
      gasPrice,
      feeUsed,
      isValid: true,
    };
  }
}
