import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TasksService } from '../tasks/tasks.service';
import { Store } from '../base/store';
import { Erc20Contract, LpSub2SubBridgeContract, RelayArgs } from "../base/contract";
import { EtherBigNumber } from '../base/bignumber';
import { EthereumProvider } from "../base/provider";
import { EthereumConnectedWallet } from "../base/wallet";
import { DataworkerService } from "../dataworker/dataworker.service";
import { ConfigureService } from '../configure/configure.service';
import { PriceOracle } from "../base/oracle";

export class BridgeConnectInfo {
    chainName: string;
    tokenAddress: string;
    provider: EthereumProvider;
    bridge: LpSub2SubBridgeContract;
}

export class LpBridges {
    isProcessing: boolean;
    toBridge: BridgeConnectInfo;
    fromBridges: BridgeConnectInfo[];
    priceOracle: PriceOracle.TokenPriceOracle;
    userFeeToken: string;
    relayerGasFeeToken: string;
}

@Injectable()
export class RelayerService implements OnModuleInit {
    private readonly logger = new Logger('relayer');
    private readonly scheduleInterval = 10000;
    private bridgeConnectInfos = new Map;
    private lpBridges: LpBridges[];
    public store: Store;

    constructor(
        protected taskService: TasksService,
        protected dataworkerService: DataworkerService,
        protected configureService: ConfigureService,
    ) {
        this.lpBridges = this.configureService.config.map((config) => {
            let toConnectInfo = this.bridgeConnectInfos[config.toChain.chainName];
            if (!toConnectInfo) {
                let provider = new EthereumProvider(config.toChain.rpc);
                let wallet = new EthereumConnectedWallet(config.privateKey, provider);
                let bridge = new LpSub2SubBridgeContract(config.toChain.bridgeAddress, wallet.wallet);
                toConnectInfo = {
                    chainName: config.toChain.chainName,
                    tokenAddress: config.toChain.tokenAddress,
                    provider,
                    bridge,
                };
                this.bridgeConnectInfos[config.toChain.chainName] = toConnectInfo;
            }
            let fromConnectInfos = config.fromChains.map((fromBridgeConfig) => {
                let fromConnectInfo = this.bridgeConnectInfos[fromBridgeConfig.chainName];
                let provider = new EthereumProvider(fromBridgeConfig.rpc);
                let wallet = new EthereumConnectedWallet(config.privateKey, provider);
                let bridge = new LpSub2SubBridgeContract(fromBridgeConfig.bridgeAddress, wallet.wallet);
                if (!fromConnectInfo) {
                    fromConnectInfo = {
                        chainName: fromBridgeConfig.chainName,
                        tokenAddress: fromBridgeConfig.tokenAddress,
                        provider,
                        bridge,
                    };
                    this.bridgeConnectInfos[fromBridgeConfig.chainName] = fromConnectInfo;
                }
                return fromConnectInfo;
            });
            const oracleName = config.priceOracle.name;
            const oracleConfig = config.priceOracle.configure;
            const provider = this.bridgeConnectInfos[config.priceOracle.chainName].provider;
            return {
                isProcessing: false,
                toBridge: toConnectInfo,
                fromBridges: fromConnectInfos,
                priceOracle: new (<any>PriceOracle)[oracleName](provider, oracleConfig),
                userFeeToken: config.priceOracle.userFeeToken,
                relayerGasFeeToken: config.priceOracle.relayerGasFeeToken,
            };
        });
    }

    // the target chain should not be conflict
    async onModuleInit() {
        this.logger.log("relayer service start");
        this.store = new Store(this.configureService.storePath);
        this.lpBridges.forEach((item, index) => {
            this.taskService.addScheduleTask(
                `${item.toBridge.chainName}-lpbridge-relayer`,
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

    async relay(bridge: LpBridges) {
        // checkPending transaction
        let txHash = await this.store.getPendingTransaction(bridge.toBridge.chainName);
        if (txHash) {
            let confirmedBlock = await bridge.toBridge.provider.checkPendingTransaction(txHash);
            if (confirmedBlock < 15) {
                this.logger.log(`waiting for relay tx finialize: ${confirmedBlock}, txHash: ${txHash}`);
                return;
            } else {
                // delete in store
                this.logger.log(`the pending tx is confirmed, txHash: ${txHash}`);
                await this.store.delPendingTransaction(bridge.toBridge.chainName);
            }
        }

        // checkProfit
        const fromChains = bridge.fromBridges.map((item) => {
            return item.chainName;
        });
        const needRelayRecords = await this.dataworkerService.queryRecordNeedRelay(
            this.configureService.indexer,
            fromChains,
            bridge.toBridge.chainName,
            bridge.toBridge.tokenAddress,
            10,
            0
        );
        if (needRelayRecords && needRelayRecords.length > 0) {
            for (const record of needRelayRecords) {
                let fromConnectInfo = this.bridgeConnectInfos[record.fromChain];
                const profitable = await this.dataworkerService.checkProfitable(
                    record,
                    bridge.toBridge.bridge,
                    fromConnectInfo.provider,
                    bridge.toBridge.provider,
                    bridge.priceOracle,
                    bridge.userFeeToken,
                    bridge.relayerGasFeeToken,
                );
                if (profitable.result) {
                    // try relay: check balance and fee enough
                    const chainId = this.dataworkerService.getChainId(record.id);
                    const args: RelayArgs = {
                        messageNonce: (new EtherBigNumber(record.messageNonce)).Number,
                        token: record.recvTokenAddress,
                        sender: record.sender,
                        receiver: record.recipient,
                        amount: (new EtherBigNumber(record.sendAmount)).Number,
                        sourceChainId: (new EtherBigNumber(chainId)).Number,
                        issuingNative: record.reason === 'issuing_native',
                    };
                    const relayGasLimit = (new EtherBigNumber(this.configureService.relayGasLimit)).Number;
                    const err = await bridge.toBridge.bridge.tryRelay(args, relayGasLimit);
                    if (err === null) {
                        this.logger.log(`find valid relay info, id: ${record.id}, amount: ${record.sendAmount}`);
                        // relay and return
                        const tx = await bridge.toBridge.bridge.relay(args, profitable.gasPrice, null, relayGasLimit);
                        // save to store
                        await this.store.savePendingTransaction(bridge.toBridge.chainName, tx.hash);
                        this.logger.log(`success relay message, txhash: ${tx.hash}`);
                        return;
                    } else {
                        this.logger.warn(`try to relay failed, id: ${record.id}, err ${err}`);
                    }
                }
            }
        }
    }
}

