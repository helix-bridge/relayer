import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { TasksService } from "../tasks/tasks.service";
import { Store } from "../base/store";
import {
  Erc20Contract,
  LnBridgeTargetContract,
  RelayArgs,
} from "../base/contract";
import { EtherBigNumber } from "../base/bignumber";
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
  bridge: LnBridgeTargetContract;
}

export class LnProviderInfo {
  providerKey: number;
  fromAddress: string;
  toAddress: string;
}

export class LnBridge {
  isProcessing: boolean;
  fromChain: string;
  toBridge: BridgeConnectInfo;
  lnProviders: LnProviderInfo[];
}

@Injectable()
export class RelayerService implements OnModuleInit {
  private readonly logger = new Logger("relayer");
  private readonly scheduleInterval = 10000;
  private readonly waitingPendingTime = 12; // 2 minute
  private chainInfos = new Map();
  private lnBridges: LnBridge[];
  public store: Store;
  private txHashCache: string;
  private lastTxTimeout: number;

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
        const privateKey = e.decrypt(config.encryptedPrivateKey);
        let wallet = new EthereumConnectedWallet(
          privateKey,
          toChainInfo.provider
        );
        let bridge = new LnBridgeTargetContract(
          config.targetBridgeAddress,
          wallet.wallet
        );
        let toConnectInfo = {
          chainInfo: toChainInfo,
          bridge,
        };
        let lnProviders = config.providers
          .map((lnProviderConfig) => {
            return {
                fromAddress: lnProviderConfig.fromAddress,
                toAddress: lnProviderConfig.toAddress,
                providerKey: lnProviderConfig.providerKey,
            };
          });

        return {
          isProcessing: false,
          fromChain: config.fromChain,
          toBridge: toConnectInfo,
          lnProviders: lnProviders,
        };
      })
      .filter((item) => item !== null);
  }

  async relay(bridge: LnBridge) {
    // checkPending transaction
    const toChainInfo = bridge.toBridge.chainInfo;
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

    // relay for each token configured
    for (const lnProvider of bridge.lnProviders) {
      // checkProfit
      const needRelayRecord =
        await this.dataworkerService.queryRecordNeedRelay(
          this.configureService.config.indexer,
          bridge.fromChain,
          toChainInfo.chainName,
          lnProvider.toAddress,
          lnProvider.providerKey,
        );
      if (needRelayRecord) {
        this.logger.log(`some tx need to relay, toChain ${toChainInfo.chainName}`);
        let fromChainInfo = this.chainInfos.get(bridge.fromChain);
        if (!fromChainInfo) {
          return;
        }
        const record = needRelayRecord.record;
        const validInfo = await this.dataworkerService.checkValid(
          record,
          bridge.toBridge.bridge,
          fromChainInfo.provider,
          toChainInfo.provider
        );
        if (validInfo.isValid) {
          let nonce: number | null = null;
          // try relay: check balance and fee enough
          const args: RelayArgs = {
            transferParameter: {
                providerKey: lnProvider.providerKey,
                previousTransferId: needRelayRecord.lastTransferId,
                lastBlockHash: record.lastBlockHash,
                amount: new EtherBigNumber(record.sendAmount).Number,
                nonce: new EtherBigNumber(record.messageNonce).Number,
                timestamp: new EtherBigNumber(record.startTime).Number,
                token: lnProvider.toAddress,
                receiver: record.recipient,
            },
            expectedTransferId: last(record.id.split('-')),
          }
          const relayGasLimit = new EtherBigNumber(
            this.configureService.config.relayGasLimit
          ).Number;
          const err = await bridge.toBridge.bridge.tryRelay(
            args,
            relayGasLimit
          );
          if (err === null) {
            this.logger.log(
              `find valid relay info, id: ${record.id}, nonce: ${nonce}, toChain ${toChainInfo.chainName}`
            );
            // relay and return
            const tx = await bridge.toBridge.bridge.relay(
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
