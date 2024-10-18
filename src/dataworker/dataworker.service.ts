import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import axios from "axios";
import { ethers } from "ethers";
import { last } from "lodash";
import {
  Erc20Contract,
  LnBridgeContract,
  Lnv3BridgeContract,
  zeroTransferId,
} from "../base/contract";
import { EthereumConnectedWallet } from "../base/wallet";
import { EthereumProvider, GasPrice } from "../base/provider";
import { Any, Ether, GWei, EtherBigNumber } from "../base/bignumber";

export interface HistoryRecord {
  id: string;
  startTime: number;
  sendTokenAddress: string;
  recvToken: string;
  sender: string;
  relayer: string;
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

export interface TransferRecord {
  lastTransferId: string;
  record: HistoryRecord;
}

export interface WithdrawLiquidityRecord {
  transferIds: string[];
  totalAmount: number;
  channel: string;
}

@Injectable()
export class DataworkerService implements OnModuleInit {
  private readonly logger = new Logger("dataworker");
  private readonly statusPending = 0;
  private readonly statusSuccess = 3;
  private readonly statusRefund = 4;
  private readonly pendingToConfirmRefund = 5;
  private readonly relayGasLimit = BigInt(100000);
  private readonly dynamicFeeExpiredTime = 60 * 15; // 15 min

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
    let firstPendingOrderBy =
      bridgeType === "lnv3" ? "nonce_asc" : "messageNonce_asc";
    let lastSuccessOrderBy =
      bridgeType === "lnv3" ? "nonce_desc" : "messageNonce_desc";
    // query first pending tx
    let query = `{
            firstHistoryRecord(
                fromChain: \"${fromChain}\",
                toChain: \"${toChain}\",
                bridge: \"${bridgeType}\",
                results: [${this.statusPending}],
                relayer: \"${relayer.toLowerCase()}\",
                token: \"${token.toLowerCase()}\",
                order: "${firstPendingOrderBy}",
                notsubmited: true
            ) {id, startTime, sendTokenAddress, recvToken, sender, relayer, recipient, sendAmount, recvAmount, fromChain, toChain, reason, fee, requestTxHash, confirmedBlocks, messageNonce, nonce}}`;
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

    // query the previous transfer record
    query = `query {
        previousHistoryRecord(
            fromChain: \"${fromChain}\",
            toChain: \"${toChain}\",
            bridge: \"${bridgeType}\",
            relayer: \"${relayer.toLowerCase()}\",
            token: \"${token.toLowerCase()}\",
            nonce: ${Number(pendingRecord.nonce)}
        ) {id}}`;

    const previousRecord = await axios
      .post(url, {
        query,
        variables: null,
      })
      .then((res) => res.data.data.previousHistoryRecord);

    const previousTransferId: string =
      previousRecord === null
        ? zeroTransferId
        : last(previousRecord.id.split("-"));
    return {
      lastTransferId: previousTransferId,
      record: pendingRecord,
    };
  }

  relayFee(gasPrice: GasPrice): bigint {
    let feeUsed: bigint;
    if (gasPrice.isEip1559) {
      let maxFeePerGas = new GWei(gasPrice.eip1559fee.maxFeePerGas).mul(
        1.00
      ).Number;
      const maxPriorityFeePerGas = new GWei(
        gasPrice.eip1559fee.maxPriorityFeePerGas
      ).mul(1.0).Number;
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

  async queryLiquidity(
    url: string,
    fromChain: string,
    toChain: string,
    relayer: string,
    token: string,
    amountThreshold: number,
    countThreshold: number,
    decimals: number
  ): Promise<WithdrawLiquidityRecord | null> {
    if (!amountThreshold && !countThreshold) return null;
    let query = `{
            historyRecords(
                row: 200,
                relayer: \"${relayer.toLowerCase()}\",
                recvTokenAddress: \"${token.toLowerCase()}\",
                fromChains: [\"${fromChain}\"],
                toChains: [\"${toChain}\"],
                bridges: [\"lnv3\"],
                needWithdrawLiquidity: true
            ) {total, records { id, lastRequestWithdraw, sendAmount }}}`;

    const needWithdrawRecords = await axios
      .post(url, {
        query,
        variables: {},
        operationName: null,
      })
      .then((res) => res.data.data.historyRecords);
    let totalWithdrawAmount = BigInt(0);
    let transferIds = [];
    let now = Date.now() / 1000;
    for (const record of needWithdrawRecords.records) {
      const lastRequestWithdraw = Number(record.lastRequestWithdraw);
      if (lastRequestWithdraw != 0 && lastRequestWithdraw + 60 * 60 > now) {
        continue;
      }
      totalWithdrawAmount += BigInt(record.sendAmount);
      transferIds.push(last(record.id.split("-")));
    }
    const withdrawAmountAvailable =
      Number(totalWithdrawAmount) / Number(new Any(1, decimals).Number);

    if (transferIds.length === 0) return null;

    if (!countThreshold && amountThreshold) {
      if (withdrawAmountAvailable < amountThreshold) return null;
    } else if (countThreshold && !amountThreshold) {
      if (transferIds.length < countThreshold) return null;
    } else {
      if (
        withdrawAmountAvailable < amountThreshold &&
        transferIds.length < countThreshold
      )
        return null;
    }

    const queryRelayInfo = `{
          queryLnBridgeRelayInfos(
              fromChain: \"${fromChain}\",
              toChain: \"${toChain}\"
              relayer: \"${relayer.toLowerCase()}\",
          ) {records { messageChannel }}}`;

    const channelInfo = await axios
      .post(url, {
        query: queryRelayInfo,
        variables: {},
        operationName: null,
      })
      .then((res) => res.data.data.queryLnBridgeRelayInfos);
    if (!channelInfo || channelInfo.records.length === 0) {
      return null;
    }
    // request channel
    return {
      transferIds: transferIds,
      totalAmount: Number(totalWithdrawAmount),
      channel: channelInfo.records[0].messageChannel,
    };
  }

  async updateConfirmedBlock(
    url: string,
    id: string,
    relayer: string,
    confirmInfo: string,
    wallet: EthereumConnectedWallet
  ) {
    const now = Math.floor(Date.now() / 1000);
    const signature = await this.signMessage(wallet, confirmInfo, now);
    const mutation = `mutation {signConfirmedBlock( id: \"${id}\", relayer: \"${relayer}\" block: \"${confirmInfo}\", timestamp: ${now}, signature: \"${signature}\")}`;
    await axios.post(url, {
      query: mutation,
      variables: null,
    });
  }

  async signMessage(
    wallet: EthereumConnectedWallet,
    message: string,
    timestamp: number
  ) {
    const messageHash = ethers.solidityPackedKeccak256(
      ["uint256", "string"],
      [timestamp, message]
    );
    return await wallet.wallet.signMessage(ethers.getBytes(messageHash));
  }

  async sendHeartBeat(
    url: string,
    fromChainId: number,
    toChainId: number,
    relayer: string,
    tokenAddress: string,
    softTransferLimit: bigint,
    version: string,
    wallet: EthereumConnectedWallet
  ) {
    if (version !== "lnv3") {
      version = "lnv2";
    }

    const now = Math.floor(Date.now() / 1000);
    const signature = await this.signMessage(
      wallet,
      `${softTransferLimit}`,
      now
    );
    const mutation = `mutation {signHeartBeat( version: \"${version}\", fromChainId: \"${fromChainId}\", toChainId: \"${toChainId}\", relayer: \"${relayer}\", tokenAddress: \"${tokenAddress}\", softTransferLimit: \"${softTransferLimit}\", timestamp: ${now}, signature: \"${signature}\")}`;
    await axios.post(url, {
      query: mutation,
      variables: null,
    });
  }

  async signDynamicBaseFee(
    url: string,
    fromChainId: number,
    toChainId: number,
    relayer: string,
    tokenAddress: string,
    dynamicFee: bigint,
    version: string,
    wallet: EthereumConnectedWallet
  ) {
    if (version !== "lnv3") {
      version = "lnv2";
    }

    const now = Math.floor(Date.now() / 1000);
    const dynamicFeeExpire = now + this.dynamicFeeExpiredTime;
    const messageHash = ethers.solidityPackedKeccak256(
      ["uint112", "uint64"],
      [dynamicFee, dynamicFeeExpire]
    );
    const dynamicFeeSignature = await wallet.wallet.signMessage(
      ethers.getBytes(messageHash)
    );
    const message = `${dynamicFee}:${dynamicFeeExpire}:${dynamicFeeSignature}`;
    const signature = await this.signMessage(wallet, message, now);

    const mutation = `mutation {signDynamicFee( version: \"${version}\", fromChainId: \"${fromChainId}\", toChainId: \"${toChainId}\", relayer: \"${relayer}\", tokenAddress: \"${tokenAddress}\", dynamicFee: \"${dynamicFee}\", dynamicFeeExpire: \"${dynamicFeeExpire}\", dynamicFeeSignature: \"${dynamicFeeSignature}\", timestamp: ${now}, signature: \"${signature}\")}`;
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
    reorgThreshold: number,
    microReorgThreshold: number,
    microThreshold: bigint,
    wallet
  ): Promise<boolean> {
    // 1. tx must be finalized
    const transactionInfo = await fromProvider.checkPendingTransaction(
      record.requestTxHash
    );
    const satisfyMicroThreshold =
      microReorgThreshold <= transactionInfo.confirmedBlock &&
      BigInt(record.sendAmount) < microThreshold;
    const satisfyLargeThreshold =
      reorgThreshold < transactionInfo.confirmedBlock;
    if (
      !transactionInfo ||
      (!satisfyMicroThreshold && !satisfyLargeThreshold)
    ) {
      const confirmedBlock = transactionInfo
        ? transactionInfo.confirmedBlock
        : 0;
      this.logger.log(
        `request tx waiting finalize ${confirmedBlock}, hash: ${record.requestTxHash}`
      );
      // update confirmed block
      const previousConfirmedBlock =
        record.confirmedBlocks === ""
          ? 0
          : Number(record.confirmedBlocks.split("/")[0]);
      if (confirmedBlock > previousConfirmedBlock) {
        const reorgShown =
          BigInt(record.sendAmount) < microThreshold
            ? microReorgThreshold
            : reorgThreshold;
        await this.updateConfirmedBlock(
          url,
          record.id,
          record.relayer,
          `${confirmedBlock}/${reorgShown}`,
          wallet
        );
      }
      return false;
    }
    // 2. tx is not relayed
    const transferId = this.getTransferId(record.id);
    const transferFilled = await toBridge.transferHasFilled(transferId);
    if (transferFilled) {
      this.logger.log(
        `[${record.fromChain}>>${record.toChain}]tx has been relayed, waiting for sync, id ${transferId}, txHash ${record.requestTxHash}`
      );
      return false;
    }
    // 3. the lock info verify
    const existInfo = await fromBridge.transferIdExist(transferId);
    if (!existInfo[0]) {
      this.logger.log(`lock info not exist, maybe reorged, id ${transferId}`);
      return false;
    } else {
      this.logger.log(`transfer locked success, info ${existInfo[1]}`);
    }
    return true;
  }
}
