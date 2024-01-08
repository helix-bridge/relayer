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
import { BigNumber } from "ethers";
import { last } from "lodash";

import { ethers } from "ethers";
import { SafeWallet } from "../base/safewallet";

export class ChainInfo {
  chainName: string;
  rpc: string;
  native: string;
  chainId: number;
  provider: EthereumProvider;
  fixedGasPrice: number;
  notSupport1559: boolean;
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
}

export class LnBridge {
  isProcessing: boolean;
  fromBridge: BridgeConnectInfo;
  toBridge: BridgeConnectInfo;
  safeWalletRole: string;
  feeLimit: number;
  reorgThreshold: number;
  direction: string;
  lnProviders: LnProviderInfo[];
  heartBeatTime: number;
}

@Injectable()
export class RelayerService implements OnModuleInit {
  private readonly logger = new Logger("relayer");
  private readonly scheduleInterval = 10000;
  private readonly waitingPendingTime = 12; // 2 minute
  private readonly maxWaitingPendingTimes = 180;
  private readonly heartBeatInterval = 6; // 1 minute
  private chainInfos = new Map();
  private lnBridges: LnBridge[];
  public store: Store;

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
      this.taskService.addScheduleTask(
        `${key}-lnbridge-relayer`,
        this.scheduleInterval,
        async () => {
          for (let item of this.lnBridges.values()) {
            if (item.toBridge.chainInfo.chainName !== key) {
              continue;
            }
            if (item.isProcessing) {
              return;
            }
            item.isProcessing = true;
            try {
              const txPending = await this.relay(item);
              if (txPending) {
                item.isProcessing = false;
                return;
              }
            } catch (err) {
              this.logger.warn(`relay bridge failed, err: ${err}`);
            }
            item.isProcessing = false;
          }
        }
      );
    });
  }

  initConfigure() {
    const e = new Encrypto();
    e.readPasswd();

    this.chainInfos = new Map(
      this.configureService.config.chains.map((config) => {
        return [
          config.name,
          {
            chainName: config.name,
            rpc: config.rpc,
            native: config.native,
            chainId: config.chainId,
            provider: new EthereumProvider(config.rpc),
            fixedGasPrice: config.fixedGasPrice,
            notSupport1559: config.notSupport1559,
            txHashCache: "",
            checkTimes: 0,
          },
        ];
      })
    );
    this.lnBridges = this.configureService.config.bridges
      .map((config) => {
        let toChainInfo = this.chainInfos.get(config.toChain);
        if (!toChainInfo) {
          this.logger.error(`to chain is not configured ${config.toChain}`);
          return null;
        }
        let fromChainInfo = this.chainInfos.get(config.fromChain);
        if (!fromChainInfo) {
          this.logger.error(`to chain is not configured ${config.fromChain}`);
          return null;
        }
        const privateKey = e.decrypt(config.encryptedPrivateKey);
        let toWallet = new EthereumConnectedWallet(
          privateKey,
          toChainInfo.provider
        );
        let toBridge = config.direction == 'lnv3' ? new Lnv3BridgeContract(
          config.targetBridgeAddress,
          toWallet.wallet
        ) : new LnBridgeContract(
          config.targetBridgeAddress,
          toWallet.wallet,
          config.direction
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
        let fromBridge = config.direction == 'lnv3' ? new Lnv3BridgeContract(
          config.sourceBridgeAddress,
          fromWallet.wallet,
        ) : new LnBridgeContract(
          config.sourceBridgeAddress,
          fromWallet.wallet,
          config.direction
        );
        let fromConnectInfo = {
          chainInfo: fromChainInfo,
          bridge: fromBridge,
          safeWallet: undefined,
        };
        let lnProviders = config.providers.map((lnProviderConfig) => {
          return {
            fromAddress: lnProviderConfig.fromAddress,
            toAddress: lnProviderConfig.toAddress,
            fromToken: new Erc20Contract(
              lnProviderConfig.fromAddress,
              fromWallet.wallet
            ),
            relayer: toSafeWallet?.address ?? toWallet.address,
            swapRate: lnProviderConfig.swapRate,
          };
        });

        return {
          isProcessing: false,
          safeWalletRole: config.safeWalletRole,
          feeLimit: config.feeLimit,
          reorgThreshold: config.reorgThreshold,
          direction: config.direction,
          fromBridge: fromConnectInfo,
          toBridge: toConnectInfo,
          lnProviders: lnProviders,
          heartBeatTime: this.heartBeatInterval,
        };
      })
      .filter((item) => item !== null);
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
          `the tx is pending, waiting for confirmed, txHash: ${chainInfo.txHashCache}, ${transactionInfo.confirmedBlock}`
        );
        return true;
      }
    }
    return false;
  }

  async relay(bridge: LnBridge) {
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
          await this.dataworkerService.sendHeartBeat(
            this.configureService.config.indexer,
            fromChainInfo.chainId,
            toChainInfo.chainId,
            lnProvider.relayer,
            lnProvider.fromAddress,
            bridge.direction
          );
        }
      }
    } catch (err) {
      this.logger.warn(`heartbeat failed, err: ${err}`);
    }

    if (bridge.safeWalletRole !== "signer") {
      try {
        if (await this.checkPendingTransaction(bridge)) {
          return true;
        }
      } catch (err) {
        this.logger.warn(`check pendingtx failed: err: ${err}, bridge: ${bridge}`);
        return true;
      }
    }

    // relay for each token configured
    for (const lnProvider of bridge.lnProviders) {
      // checkProfit
      const needRelayRecord = await this.dataworkerService.queryRecordNeedRelay(
        this.configureService.config.indexer,
        fromChainInfo.chainName,
        toChainInfo.chainName,
        lnProvider.relayer,
        lnProvider.fromAddress,
        bridge.direction
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
        this.configureService.config.indexer,
        record,
        fromBridgeContract,
        toBridgeContract,
        fromChainInfo.provider,
        toChainInfo.provider,
        bridge.reorgThreshold,
        toChainInfo.notSupport1559
      );

      if (!validInfo.isValid) {
        continue;
      }

      // Special treatment for polygon chain
      if (toChainInfo.chainName === "polygon") {
        validInfo.gasPrice.eip1559fee.maxPriorityFeePerGas = new GWei(
          35
        ).Number;
      }
      if (validInfo.feeUsed.gt(new Ether(bridge.feeLimit).Number)) {
        this.logger.log(
          `fee is exceed limit, please check, fee ${validInfo.feeUsed}`
        );
        continue;
      }
      let nonce: number | null = null;
      // try relay: check balance and fee enough
      const args: RelayArgs | RelayArgsV3 =
        bridge.direction != "lnv3"
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
                nonce: new EtherBigNumber(record.messageNonce).Number,
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
          relayData,
          isExecutor
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
      }
      return true;
    }
    return false;
  }
}
