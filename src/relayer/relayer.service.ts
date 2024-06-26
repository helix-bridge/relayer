import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { TasksService } from "../tasks/tasks.service";
import { Store } from "../base/store";
import {
  Erc20Contract,
  RelayArgs,
  RelayArgsV3,
  LnBridgeContract,
  Lnv3BridgeContract,
  SafeContract,
  zeroAddress,
} from "../base/contract";
import { Any, EtherBigNumber, Ether, GWei } from "../base/bignumber";
import {
  EthereumProvider,
  TransactionInfo,
  scaleBigger,
} from "../base/provider";
import { EthereumConnectedWallet } from "../base/wallet";
import { DataworkerService } from "../dataworker/dataworker.service";
import { ConfigureService } from "../configure/configure.service";
import { Encrypto } from "../base/encrypto";
import { last } from "lodash";

import { ethers } from "ethers";
import { SafeWallet } from "../base/safewallet";
import { messagerInstance } from "../base/messager";

export class ChainInfo {
  chainName: string;
  rpc: string;
  chainId: number;
  provider: EthereumProvider;
  fixedGasPrice: number;
  notSupport1559: boolean;
  lnv3Address: string;
  adjustingFee: boolean;
}

export class BridgeConnectInfo {
  chainInfo: ChainInfo;
  bridge: LnBridgeContract | Lnv3BridgeContract;
  safeWallet: SafeWallet;
}

export class LnProviderInfo {
  relayer: string;
  swapRate: number;
  fromAddress: string;
  toAddress: string;
  fromToken: Erc20Contract;
  withdrawLiquidityAmountThreshold: number;
  withdrawLiquidityCountThreshold: number;
  useDynamicBaseFee: boolean;
}

export class LnBridge {
  fromBridge: BridgeConnectInfo;
  toBridge: BridgeConnectInfo;
  safeWalletRole: string;
  minProfit: number;
  maxProfit: number;
  feeLimit: number;
  reorgThreshold: number;
  bridgeType: string;
  lnProviders: LnProviderInfo[];
  heartBeatTime: number;
  toWallet: EthereumConnectedWallet;
}

@Injectable()
export class RelayerService implements OnModuleInit {
  private readonly logger = new Logger("relayer");
  private readonly scheduleInterval = 10000;
  private readonly scheduleAdjustFeeInterval = 8640; // 1day
  private readonly maxWaitingPendingTimes = 180;
  private readonly heartBeatInterval = 12; // 2 minute
  private readonly withdrawLiqudityInterval = 2160; // 6 hour
  private readonly updateDynamicFeeInterval = 60; // 10 min
  private chainInfos = new Map();
  private lnBridges: LnBridge[];
  public store: Store;

  private timer = new Map();

  constructor(
    protected taskService: TasksService,
    protected dataworkerService: DataworkerService,
    protected configureService: ConfigureService
  ) {}

  // the target chain should not be conflict
  async onModuleInit() {
    this.logger.log("relayer service start");
    this.initConfigure();
    this.store = new Store(this.configureService.storePath);
    this.chainInfos.forEach((value, key) => {
      this.timer.set(key, {
        lastAdjustTime: 0,
        lastWithdrawLiqudity: 0,
        lastUpdateDynamicFeeInterval: 0,
        isProcessing: false,
      });

      this.taskService.addScheduleTask(
        `${key}-lnbridge-relayer`,
        this.scheduleInterval,
        async () => {
          const timer = this.timer.get(key);
          if (timer.isProcessing) {
            return;
          }
          timer.isProcessing = true;
          for (let item of this.lnBridges.values()) {
            if (item.toBridge.chainInfo.chainName !== key) {
              continue;
            }
            try {
              const txPending = await this.relay(
                item,
                timer.lastAdjustTime === 0,
                timer.lastWithdrawLiqudity === 0,
                timer.lastUpdateDynamicFeeInterval === 0
              );
              if (txPending) {
                timer.isProcessing = false;
                this.adjustClock(key);
                return;
              }
            } catch (err) {
              this.logger.warn(`relay bridge failed, err: ${err}`);
            }
          }
          timer.isProcessing = false;
          this.adjustClock(key);
        }
      );
    });
  }

  initConfigure() {
    const e = new Encrypto();
    e.readPasswd();

    this.chainInfos = new Map(
      this.configureService.config.rpcnodes.map((rpcnode) => {
        const chainInfo = this.configureService.getChainInfo(rpcnode.name);
        if (!chainInfo) {
          this.logger.error(
            `the chain ${rpcnode.name} not support, only support ${this.configureService.supportedChains}`
          );
          return null;
        }
        return [
          rpcnode.name,
          {
            chainName: rpcnode.name,
            rpc: rpcnode.rpc,
            chainId: chainInfo.id,
            provider: new EthereumProvider(rpcnode.rpc),
            fixedGasPrice: rpcnode.fixedGasPrice,
            notSupport1559: rpcnode.notSupport1559,
            lnv2DefaultAddress: chainInfo.lnv2DefaultAddress,
            lnv2OppositeAddress: chainInfo.lnv2OppositeAddress,
            lnv3Address: chainInfo.lnv3Address,
            tokens: chainInfo.tokens,
            txHashCache: "",
            checkTimes: 0,
          },
        ];
      })
    );
    this.lnBridges = this.configureService.config.bridges
      .map((config) => {
        const direction = config.direction?.split("->");
        if (direction?.length !== 2) {
          this.logger.error(`bridge direction invalid ${config.direction}`);
          return;
        }
        var [fromChain, toChain] = direction;
        let fromChainInfo = this.chainInfos.get(direction[0]);
        if (!fromChainInfo) {
          this.logger.error(`from chain is not invalid ${direction[0]}`);
          return null;
        }
        let toChainInfo = this.chainInfos.get(direction[1]);
        if (!toChainInfo) {
          this.logger.error(`to chain is not invalid ${direction[1]}`);
          return null;
        }

        const privateKey = e.decrypt(config.encryptedPrivateKey);
        let toWallet = new EthereumConnectedWallet(
          privateKey,
          toChainInfo.provider
        );

        let toBridge =
          config.bridgeType == "lnv3"
            ? new Lnv3BridgeContract(toChainInfo.lnv3Address, toWallet.wallet)
            : new LnBridgeContract(
                config.bridgeType === "lnv2-default"
                  ? toChainInfo.lnv2DefaultAddress
                  : toChainInfo.lnv2OppositeAddress,
                toWallet.wallet,
                config.bridgeType
              );
        var toSafeWallet: SafeWallet;
        if (config.safeWalletRole !== undefined) {
          toSafeWallet = new SafeWallet(
            config.safeWalletAddress,
            config.safeWalletUrl,
            toWallet.wallet
          );
        }
        //toSafeWallet.connect();
        let toConnectInfo = {
          chainInfo: toChainInfo,
          bridge: toBridge,
          safeWallet: toSafeWallet,
        };
        let fromWallet = new EthereumConnectedWallet(
          privateKey,
          fromChainInfo.provider
        );
        let fromBridge =
          config.bridgeType == "lnv3"
            ? new Lnv3BridgeContract(
                fromChainInfo.lnv3Address,
                fromWallet.wallet
              )
            : new LnBridgeContract(
                config.bridgeType === "lnv2-default"
                  ? fromChainInfo.lnv2DefaultAddress
                  : fromChainInfo.lnv2OppositeAddress,
                fromWallet.wallet,
                config.bridgeType
              );
        let fromConnectInfo = {
          chainInfo: fromChainInfo,
          bridge: fromBridge,
          safeWallet: undefined,
        };
        let lnProviders = config.tokens
          .map((token) => {
            const symbols = token.symbol.split("->");
            if (symbols.length !== 2) {
              this.logger.error(`invalid token symbols ${token.symbol}`);
              return null;
            }
            const fromToken = fromChainInfo.tokens.find(
              (item) => item.symbol === symbols[0]
            );
            if (!fromToken) {
              this.logger.error(
                `[${fromChainInfo.chainName}]token not support ${
                  symbols[0]
                }, only support ${fromChainInfo.tokens.map(
                  (item) => item.symbol
                )}`
              );
              return null;
            }
            const toToken = toChainInfo.tokens.find(
              (item) => item.symbol === symbols[1]
            );
            if (!toToken) {
              this.logger.error(
                `[${toChainInfo.chainName}]token not support ${
                  symbols[1]
                }, only support ${toChainInfo.tokens.map(
                  (item) => item.symbol
                )}`
              );
              return null;
            }
            return {
              fromAddress: fromToken.address,
              toAddress: toToken.address,
              fromToken: new Erc20Contract(
                fromToken.address,
                fromWallet.wallet
              ),
              relayer: toSafeWallet?.address ?? toWallet.address,
              swapRate: token.swapRate,
              withdrawLiquidityAmountThreshold:
                token.withdrawLiquidityAmountThreshold,
              withdrawLiquidityCountThreshold:
                token.withdrawLiquidityCountThreshold,
              useDynamicBaseFee: token.useDynamicBaseFee,
            };
          })
          .filter((item) => item !== null);

        return {
          safeWalletRole: config.safeWalletRole,
          minProfit: config.minProfit,
          maxProfit: config.maxProfit,
          feeLimit: config.feeLimit,
          reorgThreshold: config.reorgThreshold,
          bridgeType: config.bridgeType,
          fromBridge: fromConnectInfo,
          toBridge: toConnectInfo,
          lnProviders: lnProviders,
          heartBeatTime: this.heartBeatInterval,
          toWallet: toWallet,
        };
      })
      .filter((item) => item !== null);
  }

  async adjustFee(
    lnBridge: LnBridge,
    feeUsed: bigint,
    sourceContract: LnBridgeContract | Lnv3BridgeContract,
    fromChainInfo: ChainInfo,
    toChainInfo: ChainInfo,
    lnProviderInfo: LnProviderInfo
  ) {
    if (!lnBridge.minProfit || !lnBridge.maxProfit) return;
    if (fromChainInfo.adjustingFee) return;
    if (lnProviderInfo.swapRate < 0.01) return;
    let srcDecimals = 18;
    if (lnProviderInfo.fromAddress !== zeroAddress) {
      srcDecimals = await lnProviderInfo.fromToken.decimals();
    }
    // native fee decimals = 10**18
    function nativeFeeToToken(fee: bigint): bigint {
      return (
        (fee *
          BigInt((lnProviderInfo.swapRate * 100).toFixed()) *
          new Any(1, srcDecimals).Number) /
        new Ether(100).Number
      );
    }

    function removeDecimals(fee: bigint, decimals: number): string {
      return ethers.formatUnits(fee, decimals);
    }

    const gasLimit = new EtherBigNumber(1000000).Number;
    let lnProviderInfoOnChain = await sourceContract.getLnProviderInfo(
      toChainInfo.chainId,
      lnProviderInfo.relayer,
      lnProviderInfo.fromAddress,
      lnProviderInfo.toAddress
    );
    let baseFee = lnProviderInfoOnChain.baseFee;
    let tokenUsed = nativeFeeToToken(feeUsed);
    let profit = baseFee - tokenUsed;
    // it's the native token
    const minProfit = nativeFeeToToken(new Ether(lnBridge.minProfit).Number);
    const maxProfit = nativeFeeToToken(new Ether(lnBridge.maxProfit).Number);
    const tokenBridgeInfo = `${fromChainInfo.chainName}->${toChainInfo.chainName}>>${lnProviderInfo.fromAddress}`;
    if (profit >= minProfit && profit <= maxProfit) {
      this.logger.log(
        `[${tokenBridgeInfo}]fee is sensible, no need to update, profit: ${removeDecimals(
          profit,
          srcDecimals
        )}`
      );
      return;
    }
    const sensibleProfit = nativeFeeToToken(
      new Ether((lnBridge.minProfit + lnBridge.maxProfit) / 2).Number
    );
    const sensibleBaseFee = tokenUsed + sensibleProfit;
    let err = await sourceContract.tryUpdateFee(
      toChainInfo.chainId,
      lnProviderInfo.fromAddress,
      lnProviderInfo.toAddress,
      sensibleBaseFee,
      lnProviderInfoOnChain.liquidityFeeRate,
      lnProviderInfoOnChain.transferLimit,
      null
    );
    if (err === null) {
      const profitFmt = removeDecimals(profit, srcDecimals);
      const sensibleBaseFeeFmt = removeDecimals(sensibleBaseFee, srcDecimals);
      this.logger.log(
        `[${tokenBridgeInfo}]fee is not sensible, try to update, profit: ${profitFmt}, should in [${lnBridge.minProfit}, ${lnBridge.maxProfit}], new:${sensibleBaseFeeFmt}`
      );
      var gasPrice;
      if (fromChainInfo.fixedGasPrice !== undefined) {
        gasPrice = {
          isEip1559: false,
          fee: {
            gasPrice: new GWei(fromChainInfo.fixedGasPrice).Number,
          },
          eip1559fee: null,
        };
      } else {
        gasPrice = await fromChainInfo.provider.feeData(
          1,
          fromChainInfo.notSupport1559
        );
      }
      if (fromChainInfo.adjustingFee) return;
      // each adjust time, only send one tx
      fromChainInfo.adjustingFee = true;
      try {
        await sourceContract.updateFee(
          toChainInfo.chainId,
          lnProviderInfo.fromAddress,
          lnProviderInfo.toAddress,
          sensibleBaseFee,
          lnProviderInfoOnChain.liquidityFeeRate,
          lnProviderInfoOnChain.transferLimit,
          gasPrice,
          null
        );
      } catch (err) {
        this.logger.warn(
          `update fee failed on chain ${fromChainInfo.chainName}, err ${err}`
        );
      }
      fromChainInfo.adjustingFee = false;
    }
  }

  async checkPendingTransaction(bridge: LnBridge) {
    const toChainInfo = bridge.toBridge.chainInfo;
    let transactionInfo: TransactionInfo | null = null;
    let chainInfo = this.chainInfos.get(toChainInfo.chainName);

    if (chainInfo.txHashCache) {
      chainInfo.txHashCache = await this.store.getPendingTransaction(
        toChainInfo.chainName
      );
    }
    if (chainInfo.txHashCache) {
      transactionInfo = await toChainInfo.provider.checkPendingTransaction(
        chainInfo.txHashCache
      );
      // may be query error
      if (transactionInfo === null) {
        chainInfo.checkTimes += 1;
        // if always query null, maybe reorg or replaced
        if (chainInfo.checkTimes >= this.maxWaitingPendingTimes) {
          this.logger.warn(
            `this tx may replaced or reorged, reset txHash ${chainInfo.txHashCache}, ${toChainInfo.chainName}`
          );
          await this.store.delPendingTransaction(toChainInfo.chainName);
          chainInfo.txHashCache = null;
          chainInfo.checkTimes = 0;
        }
        return true;
      } else {
        chainInfo.checkTimes = 0;
      }
      // confirmed
      if (transactionInfo.confirmedBlock > 0) {
        if (transactionInfo.confirmedBlock < 3) {
          this.logger.log(
            `waiting for relay tx finialize: ${transactionInfo.confirmedBlock}, txHash: ${chainInfo.txHashCache}`
          );
          return true;
        } else {
          // delete in store
          this.logger.log(
            `the pending tx is confirmed, txHash: ${chainInfo.txHashCache}`
          );
          await this.store.delPendingTransaction(toChainInfo.chainName);
          chainInfo.txHashCache = null;
          return false;
        }
      } else {
        this.logger.log(
          `the tx is pending, waiting for confirmed, txHash: ${chainInfo.txHashCache}, ${transactionInfo.confirmedBlock},  ${transactionInfo.nonce}`
        );
        return true;
      }
    }
    return false;
  }

  private adjustClock(key: string) {
    let timer = this.timer.get(key);

    timer.lastAdjustTime += 1;
    timer.lastWithdrawLiqudity += 1;
    timer.lastUpdateDynamicFeeInterval += 1;
    if (timer.lastAdjustTime >= this.scheduleAdjustFeeInterval) {
      timer.lastAdjustTime = 0;
    }
    if (timer.lastWithdrawLiqudity >= this.withdrawLiqudityInterval) {
      timer.lastWithdrawLiqudity = 0;
    }
    if (timer.lastUpdateDynamicFeeInterval >= this.updateDynamicFeeInterval) {
      timer.lastUpdateDynamicFeeInterval = 0;
    }
  }

  async relay(
    bridge: LnBridge,
    needAdjustFee: boolean,
    needWithdrawLiqudity: boolean,
    needUpdateDynamicFee: boolean
  ) {
    // checkPending transaction
    const toChainInfo = bridge.toBridge.chainInfo;
    const fromChainInfo = bridge.fromBridge.chainInfo;
    const fromBridgeContract = bridge.fromBridge.bridge;
    const toBridgeContract = bridge.toBridge.bridge;

    // send heartbeat first
    try {
      bridge.heartBeatTime += 1;
      if (bridge.heartBeatTime > this.heartBeatInterval) {
        bridge.heartBeatTime = 0;
        for (const lnProvider of bridge.lnProviders) {
          let softTransferLimit = BigInt(0);
          try {
            if (bridge.bridgeType === "lnv3") {
              const penaltyEnough = await fromBridgeContract.isPenaltyEnough(
                toChainInfo.chainId,
                lnProvider.relayer,
                lnProvider.fromAddress,
                lnProvider.toAddress
              );
              if (!penaltyEnough) {
                this.logger.warn(
                  `penalty not enough, from ${fromChainInfo.chainName}, to ${toChainInfo.chainName}, token ${lnProvider.fromAddress}`
                );
                continue;
              }
            }
            softTransferLimit = await toBridgeContract.getSoftTransferLimit(
              lnProvider.relayer,
              lnProvider.toAddress,
              toChainInfo.provider.provider
            );
          } catch (e) {
            // ignore error
            // this time don't send heartbeat
            continue;
          }
          await this.dataworkerService.sendHeartBeat(
            this.configureService.indexer,
            fromChainInfo.chainId,
            toChainInfo.chainId,
            lnProvider.relayer,
            lnProvider.fromAddress,
            softTransferLimit,
            bridge.bridgeType,
            bridge.toWallet
          );
        }
      }
    } catch (err) {
      this.logger.warn(
        `heartbeat failed, url: ${this.configureService.indexer}, err: ${err}`
      );
    }

    if (bridge.safeWalletRole !== "signer") {
      try {
        if (await this.checkPendingTransaction(bridge)) {
          return true;
        }
      } catch (err) {
        this.logger.warn(
          `check pendingtx failed: err: ${err}, bridge: ${bridge}`
        );
        return true;
      }
    }

    let nativeFeeUsed = BigInt(0);
    // relay for each token configured
    for (const lnProvider of bridge.lnProviders) {
      if (lnProvider.useDynamicBaseFee && needUpdateDynamicFee) {
        if (nativeFeeUsed <= 0) {
          let gasPrice = await toChainInfo.provider.feeData(
            1,
            toChainInfo.notSupport1559
          );
          nativeFeeUsed = this.dataworkerService.relayFee(gasPrice);
        }
        const dynamicBaseFee = nativeFeeUsed * BigInt(lnProvider.swapRate);

        let srcDecimals = 18;
        if (lnProvider.fromAddress !== zeroAddress) {
          srcDecimals = await lnProvider.fromToken.decimals();
        }
        // native fee decimals = 10**18
        function nativeFeeToToken(fee: bigint): bigint {
          return (
            (fee *
              BigInt((lnProvider.swapRate * 100).toFixed()) *
              new Any(1, srcDecimals).Number) /
            new Ether(100).Number
          );
        }
        const baseFee = nativeFeeToToken(
          nativeFeeUsed + new Ether(bridge.minProfit).Number
        );
        await this.dataworkerService.signDynamicBaseFee(
          this.configureService.indexer,
          fromChainInfo.chainId,
          toChainInfo.chainId,
          lnProvider.relayer,
          lnProvider.fromAddress,
          baseFee,
          bridge.bridgeType,
          bridge.toWallet
        );
      } else if (needAdjustFee) {
        if (nativeFeeUsed <= 0) {
          let gasPrice = await toChainInfo.provider.feeData(
            1,
            toChainInfo.notSupport1559
          );
          nativeFeeUsed = this.dataworkerService.relayFee(gasPrice);
        }
        await this.adjustFee(
          bridge,
          nativeFeeUsed,
          fromBridgeContract,
          fromChainInfo,
          toChainInfo,
          lnProvider
        );
      }
      if (bridge.bridgeType === "lnv3" && needWithdrawLiqudity) {
        try {
          let srcDecimals = 18;
          if (lnProvider.fromAddress !== zeroAddress) {
            srcDecimals = await lnProvider.fromToken.decimals();
          }
          const needWithdrawRecords =
            await this.dataworkerService.queryLiquidity(
              this.configureService.indexer,
              fromChainInfo.chainName,
              toChainInfo.chainName,
              lnProvider.relayer,
              lnProvider.toAddress,
              lnProvider.withdrawLiquidityAmountThreshold,
              lnProvider.withdrawLiquidityCountThreshold,
              srcDecimals
            );
          if (needWithdrawRecords != null) {
            // token transfer direction fromChain -> toChain
            // withdrawLiquidity message direction toChain -> fromChain
            const fromChannel = this.configureService.getMessagerAddress(
              fromChainInfo.chainName,
              needWithdrawRecords.channel
            );
            const toChannel = this.configureService.getMessagerAddress(
              toChainInfo.chainName,
              needWithdrawRecords.channel
            );
            const messager = messagerInstance(
              needWithdrawRecords.channel,
              toChannel.address,
              bridge.toWallet.wallet
            );
            const lnv3Contract = toBridgeContract as Lnv3BridgeContract;
            const appPayload = lnv3Contract.encodeWithdrawLiquidity(
              needWithdrawRecords.transferIds,
              toChainInfo.chainId,
              lnProvider.relayer
            );
            const payload = messager.encodePayload(
              toChainInfo.chainId,
              toChainInfo.lnv3Address,
              fromChainInfo.lnv3Address,
              appPayload
            );
            const params = await messager.params(
              toChainInfo.chainId,
              fromChainInfo.chainId,
              fromChannel.address,
              payload,
              lnProvider.relayer
            );
            const err = await lnv3Contract.tryWithdrawLiquidity(
              fromChainInfo.chainId,
              needWithdrawRecords.transferIds,
              lnProvider.relayer,
              params.extParams,
              params.fee
            );
            if (err != null) {
              this.logger.warn(
                `try to withdraw liquidity failed, err ${err}, from ${fromChainInfo.chainId}, to ${toChainInfo.chainId}`
              );
            } else {
              this.logger.log(
                `withdrawLiquidity ${fromChainInfo.chainId}->${
                  toChainInfo.chainId
                }, info: ${JSON.stringify(needWithdrawRecords)}, fee: ${
                  params.fee
                }`
              );
              let gasPrice = await toChainInfo.provider.feeData(
                1,
                toChainInfo.notSupport1559
              );
              const tx = await lnv3Contract.withdrawLiquidity(
                fromChainInfo.chainId,
                needWithdrawRecords.transferIds,
                lnProvider.relayer,
                params.extParams,
                gasPrice,
                params.fee
              );
              this.logger.log(
                `withdrawLiquidity tx ${tx.hash} on ${toChainInfo.chainId}`
              );
            }
          }
        } catch (e) {
          this.logger.warn(`try to withdraw liquidity failed, err ${e}`);
        }
      }
      // checkProfit
      const needRelayRecord = await this.dataworkerService.queryRecordNeedRelay(
        this.configureService.indexer,
        fromChainInfo.chainName,
        toChainInfo.chainName,
        lnProvider.relayer,
        lnProvider.fromAddress,
        bridge.bridgeType
      );
      if (!needRelayRecord) {
        continue;
      }
      this.logger.log(
        `some tx need to relay, toChain ${toChainInfo.chainName}`
      );
      if (!fromChainInfo) {
        continue;
      }
      const record = needRelayRecord.record;
      const validInfo = await this.dataworkerService.checkValid(
        this.configureService.indexer,
        record,
        fromBridgeContract,
        toBridgeContract,
        fromChainInfo.provider,
        toChainInfo.provider,
        bridge.reorgThreshold,
        toChainInfo.notSupport1559,
        bridge.toWallet
      );

      if (!validInfo.isValid) {
        continue;
      }

      if (validInfo.feeUsed > new Ether(bridge.feeLimit).Number) {
        this.logger.log(
          `fee is exceed limit, please check, fee ${validInfo.feeUsed}`
        );
        continue;
      }
      let nonce: number | null = null;
      // try relay: check balance and fee enough
      const args: RelayArgs | RelayArgsV3 =
        bridge.bridgeType != "lnv3"
          ? {
              transferParameter: {
                previousTransferId: needRelayRecord.lastTransferId,
                relayer: lnProvider.relayer,
                sourceToken: lnProvider.fromAddress,
                targetToken: lnProvider.toAddress,
                amount: new EtherBigNumber(record.recvAmount).Number,
                timestamp: new EtherBigNumber(record.startTime).Number,
                receiver: record.recipient,
              },
              remoteChainId: fromChainInfo.chainId,
              expectedTransferId: last(record.id.split("-")),
            }
          : {
              transferParameter: {
                remoteChainId: fromChainInfo.chainId,
                provider: lnProvider.relayer,
                sourceToken: lnProvider.fromAddress,
                targetToken: lnProvider.toAddress,
                sourceAmount: new EtherBigNumber(record.sendAmount).Number,
                targetAmount: new EtherBigNumber(record.recvAmount).Number,
                receiver: record.recipient,
                timestamp: new EtherBigNumber(record.messageNonce).Number,
              },
              expectedTransferId: last(record.id.split("-")),
            };
      const configuredGasLimit = this.configureService.config.relayGasLimit;
      const relayGasLimit =
        configuredGasLimit !== undefined
          ? new EtherBigNumber(configuredGasLimit).Number
          : null;

      const isExecutor = bridge.safeWalletRole === "executor";
      if (bridge.safeWalletRole === "signer" || isExecutor) {
        const relayData = toBridgeContract.relayRawData(args);
        const txInfo = await bridge.toBridge.safeWallet.proposeTransaction(
          toBridgeContract.address,
          relayData.data,
          relayData.value,
          isExecutor,
          BigInt(toChainInfo.chainId)
        );
        if (txInfo !== null && txInfo.readyExecute && isExecutor) {
          const safeContract = new SafeContract(
            bridge.toBridge.safeWallet.address,
            bridge.toBridge.safeWallet.signer
          );
          const err = await safeContract.tryExecTransaction(
            txInfo.to,
            txInfo.txData,
            txInfo.signatures
          );
          if (err != null) {
            this.logger.warn(
              `[${fromChainInfo.chainName}>>${toChainInfo.chainName}] try to relay using safe failed, id: ${record.id}, err ${err}`
            );
            continue;
          } else {
            const tx = await safeContract.execTransaction(
              txInfo.to,
              txInfo.txData,
              txInfo.signatures,
              validInfo.gasPrice
            );
            await this.store.savePendingTransaction(
              toChainInfo.chainName,
              tx.hash
            );
            let chainInfo = this.chainInfos.get(toChainInfo.chainName);
            chainInfo.txHashCache = tx.hash;
            this.logger.log(
              `[${fromChainInfo.chainName}>>${toChainInfo.chainName}] success relay message, txhash: ${tx.hash}`
            );
          }
        }
      } else {
        const err = await toBridgeContract.tryRelay(args, relayGasLimit);
        if (err !== null) {
          this.logger.warn(
            `[${fromChainInfo.chainName}>>${toChainInfo.chainName}] try to relay failed, id: ${record.id}, err ${err}`
          );
          console.log(args);
          continue;
        }
        this.logger.log(
          `find valid relay info, id: ${record.id}, nonce: ${nonce}, toChain ${toChainInfo.chainName}`
        );
        // relay and return
        const tx = await toBridgeContract.relay(
          args,
          validInfo.gasPrice,
          nonce,
          relayGasLimit
        );
        // save to store
        await this.store.savePendingTransaction(toChainInfo.chainName, tx.hash);
        let chainInfo = this.chainInfos.get(toChainInfo.chainName);
        chainInfo.txHashCache = tx.hash;
        this.logger.log(
          `[${fromChainInfo.chainName}>>${toChainInfo.chainName}] success relay message, txhash: ${tx.hash}`
        );
        await this.dataworkerService.updateConfirmedBlock(
          this.configureService.indexer,
          record.id,
          record.relayer,
          `${tx.hash}`,
          bridge.toWallet
        );
      }
      return true;
    }
    return false;
  }
}
