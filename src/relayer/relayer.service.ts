import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { TasksService } from "../tasks/tasks.service";
import { Store } from "../base/store";
import {
  Erc20Contract,
  LnBridgeSourceContract,
  LnBridgeTargetContract,
  RelayArgs,
} from "../base/contract";
import { EtherBigNumber, GWei } from "../base/bignumber";
import {
  EthereumProvider,
  TransactionInfo,
  scaleBigger,
} from "../base/provider";
import { EthereumConnectedWallet } from "../base/wallet";
import { DataworkerService } from "../dataworker/dataworker.service";
import { ConfigureService } from "../configure/configure.service";
import { Ether } from "../base/bignumber";
import { Encrypto } from "../base/encrypto";
import { BigNumber } from "ethers";
import { last } from "lodash";

export class ChainInfo {
  chainName: string;
  rpc: string;
  native: string;
  provider: EthereumProvider;
}

export class BridgeConnectInfo {
  chainInfo: ChainInfo;
  bridge: LnBridgeTargetContract | LnBridgeSourceContract;
}

export class LnProviderInfo {
  relayer: string;
  swapRate: number;
  fromAddress: string;
  toAddress: string;
}

export class LnBridge {
  isProcessing: boolean;
  fromBridge: BridgeConnectInfo;
  toBridge: BridgeConnectInfo;
  minProfit: number;
  maxProfit: number;
  feeLimit: number;
  lnProviders: LnProviderInfo[];
}

@Injectable()
export class RelayerService implements OnModuleInit {
  private readonly logger = new Logger("relayer");
  private readonly scheduleInterval = 10000;
  private readonly waitingPendingTime = 12; // 2 minute
  private readonly scheduleAdjustFeeInterval = 8640; // 1 day
  private chainInfos = new Map();
  private lnBridges: LnBridge[];
  public store: Store;
  private txHashCache: string;
  private lastTxTimeout: number;
  private lastAdjustTime: number;

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
    this.lastAdjustTime = 0;
    this.lnBridges.forEach((item, index) => {
      this.taskService.addScheduleTask(
        `${item.toBridge.bridge.address}-lpbridge-relayer`,
        this.scheduleInterval,
        async () => {
          if (item.isProcessing) {
            return;
          }
          item.isProcessing = true;
          try {
            await this.relay(item);
          } catch (err) {
            this.logger.warn(`relay bridge failed, err: ${err}`);
          }
          item.isProcessing = false;
        }
      );
    });
  }

  async initConfigure() {
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
            provider: new EthereumProvider(config.rpc),
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
        let toBridge = new LnBridgeTargetContract(
          config.targetBridgeAddress,
          toWallet.wallet
        );
        let toConnectInfo = {
          chainInfo: toChainInfo,
          bridge: toBridge,
        };
        let fromWallet = new EthereumConnectedWallet(
          privateKey,
          fromChainInfo.provider
        );
        let fromBridge = new LnBridgeSourceContract(
          config.sourceBridgeAddress,
          fromWallet.wallet
        );
        let fromConnectInfo = {
          chainInfo: fromChainInfo,
          bridge: fromBridge,
        };
        let lnProviders = config.providers
          .map((lnProviderConfig) => {
            return {
                fromAddress: lnProviderConfig.fromAddress,
                toAddress: lnProviderConfig.toAddress,
                relayer: toWallet.address,
                swapRate: lnProviderConfig.swapRate,
            };
          });

        return {
          isProcessing: false,
          minProfit: config.minProfit,
          maxProfit: config.maxProfit,
          feeLimit: config.feeLimit,
          fromBridge: fromConnectInfo,
          toBridge: toConnectInfo,
          lnProviders: lnProviders,
        };
      })
      .filter((item) => item !== null);
  }

  async adjustFee(
      lnBridge: LnBridge,
      feeUsed: BigNumber,
      sourceContract: LnBridgeSourceContract,
      fromProvider: EthereumProvider,
      lnProviderInfo: LnProviderInfo,
  ) {
      const gasLimit = new EtherBigNumber(1000000).Number;
      let lnProviderInfoOnChain = await sourceContract.lnProviderInfo(lnProviderInfo.relayer, lnProviderInfo.fromAddress)
      let baseFee = lnProviderInfoOnChain.config.baseFee;
      let tokenUsed = feeUsed.mul(lnProviderInfo.swapRate);
      let profit = baseFee.sub(tokenUsed);
      const minProfit = (new Ether(lnBridge.minProfit).Number).mul(lnProviderInfo.swapRate);
      const maxProfit = (new Ether(lnBridge.maxProfit).Number).mul(lnProviderInfo.swapRate);
      if (profit.lt(minProfit) || profit.gt(maxProfit)) {
          const sensibleProfit = (new Ether((lnBridge.minProfit + lnBridge.maxProfit)/2).Number).mul(lnProviderInfo.swapRate);
          const sensibleBaseFee = tokenUsed.add(sensibleProfit);
          let err = await sourceContract.tryUpdateFee(
              lnProviderInfo.fromAddress,
              sensibleBaseFee,
              lnProviderInfoOnChain.config.liquidityFeeRate,
              gasLimit,
          );
          if (err === null) {
              this.logger.log(`fee is not sensible, update to new: ${sensibleBaseFee}`);
              // todo for arbitrum we use 0.1 gwei here
              let gasPrice = {
                  isEip1559: false,
                  fee: {
                      gasPrice: new GWei(0.1).Number,
                  },
                  eip1559fee: null,
              };
              await sourceContract.updateFee(
                  lnProviderInfo.fromAddress,
                  sensibleBaseFee,
                  lnProviderInfoOnChain.config.liquidityFeeRate,
                  gasPrice,
                  gasLimit,
              );
          }
      }
  }

  async relay(bridge: LnBridge) {
    // checkPending transaction
    const toChainInfo = bridge.toBridge.chainInfo;
    const fromChainInfo = bridge.fromBridge.chainInfo;
    const fromBridgeContract = bridge.fromBridge.bridge as LnBridgeSourceContract;
    const toBridgeContract = bridge.toBridge.bridge as LnBridgeTargetContract;
    let transactionInfo: TransactionInfo | null = null;
    if (!this.txHashCache) {
        this.txHashCache = await this.store.getPendingTransaction(toChainInfo.chainName);
    }
    if (this.txHashCache) {
      transactionInfo = await toChainInfo.provider.checkPendingTransaction(
        this.txHashCache
      );
      // may be query error
      if (transactionInfo === null) {
        return;
      }
      // confirmed
      if (transactionInfo.confirmedBlock > 0) {
        this.lastTxTimeout = 0;
        if (transactionInfo.confirmedBlock < 8) {
          this.logger.log(
            `waiting for relay tx finialize: ${transactionInfo.confirmedBlock}, txHash: ${this.txHashCache}`
          );
          return;
        } else {
          // delete in store
          this.logger.log(`the pending tx is confirmed, txHash: ${this.txHashCache}`);
          await this.store.delPendingTransaction(toChainInfo.chainName);
          this.txHashCache = null;
          return;
        }
      } else {
          this.logger.log(`the tx is pending, waiting for confirmed, txHash: ${this.txHashCache}, ${this.lastTxTimeout}, ${transactionInfo.confirmedBlock}`);
          // if timeout, replace it by new tx, else waiting for confirmed
          if (this.lastTxTimeout < this.waitingPendingTime) {
              this.lastTxTimeout += 1;
              return;
          }
      }
    }

    this.lastAdjustTime += 1;
    let needAdjustFee = false;
    if (this.lastAdjustTime >= this.scheduleAdjustFeeInterval) {
        this.lastAdjustTime = 0;
        needAdjustFee = true;
        this.logger.log("schedule adjust fee");
    }
    // relay for each token configured
    for (const lnProvider of bridge.lnProviders) {
      // adjust fee
      if (needAdjustFee) {
        let gasPrice = await toChainInfo.provider.feeData();
        const feeUsed = this.dataworkerService.relayFee(gasPrice);
        await this.adjustFee(
          bridge,
          feeUsed,
          fromBridgeContract,
          fromChainInfo.provider,
          lnProvider,
        );
      }

      // checkProfit
      const needRelayRecord =
        await this.dataworkerService.queryRecordNeedRelay(
          this.configureService.config.indexer,
          fromChainInfo.chainName,
          toChainInfo.chainName,
          lnProvider.relayer,
          lnProvider.fromAddress
        );
      if (needRelayRecord) {
        this.logger.log(`some tx need to relay, toChain ${toChainInfo.chainName}`);
        if (!fromChainInfo) {
          return;
        }
        const record = needRelayRecord.record;
        const validInfo = await this.dataworkerService.checkValid(
          record,
          fromBridgeContract,
          toBridgeContract,
          fromChainInfo.provider,
          toChainInfo.provider
        );
        if (validInfo.feeUsed.gt(new Ether(bridge.feeLimit).Number)) {
          this.logger.log(
            `fee is exceed limit, please check, fee ${validInfo.feeUsed}`
          );
          return;
        }
        if (validInfo.isValid) {
          let nonce: number | null = null;
          // try relay: check balance and fee enough
          const args: RelayArgs = {
            transferParameter: {
                previousTransferId: needRelayRecord.lastTransferId,
                relayer: lnProvider.relayer,
                sourceToken: lnProvider.fromAddress,
                targetToken: lnProvider.toAddress,
                amount: new EtherBigNumber(record.sendAmount).Number,
                timestamp: new EtherBigNumber(record.startTime).Number,
                receiver: record.recipient,
            },
            expectedTransferId: last(record.id.split('-')),
          }
          const relayGasLimit = new EtherBigNumber(
            this.configureService.config.relayGasLimit
          ).Number;
          const err = await toBridgeContract.tryRelay(
            args,
            relayGasLimit
          );
          if (err === null) {
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
            await this.store.savePendingTransaction(
              toChainInfo.chainName,
              tx.hash
            );
            this.txHashCache = tx.hash;
            this.lastTxTimeout = 0;
            this.logger.log(`success relay message, txhash: ${tx.hash}`);
            await this.adjustFee(
                bridge,
                validInfo.feeUsed,
                fromBridgeContract,
                fromChainInfo.provider,
                lnProvider,
            );
            return;
          } else {
            this.logger.warn(
              `try to relay failed, id: ${record.id}, err ${err}`
            );
          }
        }
      }
    }
  }
}
