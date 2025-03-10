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
  MulticallContract,
  MulticallArgs,
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

import { ethers, AbiCoder } from "ethers";
import { SafeWallet } from "../base/safewallet";
import { messagerInstance } from "../base/messager";
import { Aave } from "../liquidity/lend/aave";
import { Moonwell } from "../liquidity/lend/moonwell";
import { LendMarket } from "../liquidity/lend/market";
import { CeramicService } from "../base/safe-service/ceramic.service";
import { SingleService } from "../base/safe-service/single.service";
import { SafeGlobalService } from "../base/safe-service/safeglobal.service";
import { ApolloService } from "../base/safe-service/apollo.service";
import { SafeService } from "../base/safe-service/safe.service";
import { gasPriceToString } from "../base/provider";

const kMaxWithdrawTransferCount = 16;
export const kMaxWithdrawTransferAmount: number = Number.MAX_VALUE;

export class ChainInfo {
  chainName: string;
  rpcs: string[];
  chainId: number;
  provider: EthereumProvider;
  fixedGasPrice: number;
  notSupport1559: boolean;
  gasPriceStretching: number;
  relayGasLimit: number;
  lnv3Address: string;
  adjustingFee: boolean;
  lendMarket: LendMarket[];
  multicall: MulticallContract;
}

export class BridgeConnectInfo {
  chainInfo: ChainInfo;
  bridge: LnBridgeContract | Lnv3BridgeContract;
  safeWallet: SafeWallet;
}

export class LnProviderInfo {
  resolverOnSource: string;
  relayer: string;
  swapRate: number;
  microThreshold: number;
  fromAddress: string;
  toAddress: string;
  // cache the decimals to decrease request from chain
  fromTokenDecimals: number;
  toTokenDecimals: number;
  fromToken: Erc20Contract | null;
  toToken: Erc20Contract | null;
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
  microReorgThreshold: number;
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
  private readonly withdrawLiqudityInterval = 180; // 0.5 hour
  private readonly updateDynamicFeeInterval = 60; // 10 min
  private readonly repayLendInterval = 60;
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
    await this.initConfigure();
    this.store = new Store(this.configureService.storePath);
    this.chainInfos.forEach((value, key) => {
      this.timer.set(key, {
        lastAdjustTime: 0,
        lastWithdrawLiqudity: 0,
        lastUpdateDynamicFeeInterval: 0,
        lastRepayLend: 0,
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
              this.logger.warn(`[${key}]relay bridge failed, err: ${err}`);
            }
          }
          if (timer.lastRepayLend === 0) {
            try {
              const busy = await this.repayDept(key);
              if (busy) {
                timer.lastRepayLend = 0;
              }
            } catch (err) {
              this.logger.warn(
                `[${key}]try to check repay dept failed, err: ${err}`
              );
            }
          }
          timer.isProcessing = false;
          this.adjustClock(key);
        }
      );
    });
  }

  async initConfigure() {
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
        const rpcs = [...(rpcnode.rpcs || []), ...chainInfo.rpcs];
        const provider = new EthereumProvider(rpcs);
        const lendMarket = rpcnode.lendMarket?.map((market) => {
          switch (market.protocol) {
            // currently only support aave
            case "aave":
            case "spark":
              return new Aave(
                rpcnode.name,
                this.configureService.config.env === "test",
                market.protocol,
                market.healthFactorLimit ?? 3.0,
                market.collaterals,
                market.tokens,
                provider
              );
            case "moonwell":
              return new Moonwell(
                rpcnode.name,
                this.configureService.config.env === "test",
                market.healthFactorLimit ?? 0.5,
                market.collaterals,
                market.tokens,
                provider
              );
            default:
              return null;
          }
        });
        return [
          rpcnode.name,
          {
            chainName: rpcnode.name,
            rpcs: rpcs,
            chainId: chainInfo.id,
            provider: provider,
            fixedGasPrice: rpcnode.fixedGasPrice,
            notSupport1559: rpcnode.notSupport1559,
            gasPriceStretching: rpcnode.gasPriceStretching ?? 1.1,
            relayGasLimit: rpcnode.relayGasLimit,
            lnv2DefaultAddress: chainInfo.protocol["lnv2-default"],
            lnv2OppositeAddress: chainInfo.protocol["lnv2-opposite"],
            lnv3Address: chainInfo.protocol.lnv3,
            tokens: chainInfo.tokens,
            txHashCache: "",
            checkTimes: 0,
            lendMarket: lendMarket ?? [],
            multicall: new MulticallContract(
              chainInfo.additional.multicallAddress,
              provider
            ),
          },
        ];
      })
    );
    this.lnBridges = await Promise.all(
      this.configureService.config.bridges
        .map(async (config) => {
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

          const isCeramic =
            config.safeWalletType === "ceramic" && config.encryptedCeramicKey;
          const privateKey = e.decrypt(config.encryptedPrivateKey);
          const ceramicKey = isCeramic
            ? e.decrypt(config.encryptedCeramicKey)
            : "";
          let toWallet = new EthereumConnectedWallet(
            privateKey,
            toChainInfo.provider
          );

          let toBridge =
            config.bridgeType == "lnv3"
              ? new Lnv3BridgeContract(toChainInfo.lnv3Address, toWallet)
              : new LnBridgeContract(
                  config.bridgeType === "lnv2-default"
                    ? toChainInfo.lnv2DefaultAddress
                    : toChainInfo.lnv2OppositeAddress,
                  toWallet,
                  config.bridgeType
                );
          let toConnectInfo = {
            chainInfo: toChainInfo,
            bridge: toBridge,
            safeWallet: undefined,
          };
          if (config.safeWalletRole !== undefined) {
            let safeService: SafeService =
              config.safeWalletType === "ceramic"
                ? new CeramicService(ceramicKey, config.safeWalletUrl)
                : config.safeWalletType === "single"
                ? new SingleService()
                : config.safeWalletType === "apollo"
                ? new ApolloService(
                    toChainInfo.chainId,
                    this.configureService.indexer
                  )
                : new SafeGlobalService(
                    config.safeWalletUrl,
                    toChainInfo.chainId
                  );
            toConnectInfo.safeWallet = new SafeWallet(
              config.safeWalletAddress,
              toWallet,
              safeService
            );
          }
          let fromWallet = new EthereumConnectedWallet(
            privateKey,
            fromChainInfo.provider
          );
          let fromBridge =
            config.bridgeType == "lnv3"
              ? new Lnv3BridgeContract(fromChainInfo.lnv3Address, fromWallet)
              : new LnBridgeContract(
                  config.bridgeType === "lnv2-default"
                    ? fromChainInfo.lnv2DefaultAddress
                    : fromChainInfo.lnv2OppositeAddress,
                  fromWallet,
                  config.bridgeType
                );
          let fromConnectInfo = {
            chainInfo: fromChainInfo,
            bridge: fromBridge,
            safeWallet: undefined,
          };

          const relayer = toConnectInfo.safeWallet?.address ?? toWallet.address;
          let lnProviders = await Promise.all(
            config.tokens
              .map(async (token) => {
                const symbols = token.symbol.split("->");
                if (symbols.length !== 2) {
                  this.logger.error(`invalid token symbols ${token.symbol}`);
                  return null;
                }
                const fromToken = fromChainInfo.tokens.find(
                  (item) =>
                    item.symbol.toLowerCase() === symbols[0].toLowerCase()
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
                  (item) =>
                    item.symbol.toLowerCase() === symbols[1].toLowerCase()
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
                var fromTokenContract,
                  toTokenContract = null;
                var fromTokenDecimals,
                  toTokenDecimals = 18;
                if (fromToken.address !== zeroAddress) {
                  fromTokenContract = new Erc20Contract(
                    fromToken.address,
                    fromWallet
                  );
                  fromTokenDecimals = -1;
                }
                if (toToken.address !== zeroAddress) {
                  toTokenContract = new Erc20Contract(
                    toToken.address,
                    toWallet
                  );
                  toTokenDecimals = -1;
                }
                return {
                  fromAddress: fromToken.address,
                  toAddress: toToken.address,
                  fromTokenDecimals: fromTokenDecimals,
                  toTokenDecimals: toTokenDecimals,
                  fromToken: fromTokenContract,
                  toToken: toTokenContract,
                  relayer: relayer,
                  resolverOnSource: config.providerAddress ?? relayer,
                  swapRate: token.swapRate,
                  microThreshold: token.microThreshold ?? 0,
                  withdrawLiquidityAmountThreshold:
                    token.withdrawLiquidityAmountThreshold,
                  withdrawLiquidityCountThreshold:
                    token.withdrawLiquidityCountThreshold,
                  useDynamicBaseFee: token.useDynamicBaseFee,
                };
              })
              .filter((item) => item !== null)
          );

          return {
            safeWalletRole: config.safeWalletRole,
            minProfit: config.minProfit,
            maxProfit: config.maxProfit,
            feeLimit: config.feeLimit,
            reorgThreshold: config.reorgThreshold,
            microReorgThreshold:
              config.microReorgThreshold ?? config.reorgThreshold,
            bridgeType: config.bridgeType,
            fromBridge: fromConnectInfo,
            toBridge: toConnectInfo,
            lnProviders: lnProviders,
            heartBeatTime: this.heartBeatInterval,
            toWallet: toWallet,
          };
        })
        .filter((item) => item !== null)
    );
  }

  async gasPrice(chainInfo: ChainInfo) {
    if (chainInfo.fixedGasPrice !== undefined) {
      return {
        isEip1559: false,
        fee: {
          gasPrice: new GWei(chainInfo.fixedGasPrice).Number,
        },
        eip1559fee: null,
      };
    } else {
      return await chainInfo.provider.feeData(
        chainInfo.gasPriceStretching,
        chainInfo.notSupport1559
      );
    }
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
    if (lnProviderInfo.fromTokenDecimals === -1) {
      lnProviderInfo.fromTokenDecimals =
        await lnProviderInfo.fromToken.decimals();
    }
    let srcDecimals = lnProviderInfo.fromTokenDecimals;
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
      lnProviderInfo.resolverOnSource,
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
      const gasPrice = await this.gasPrice(fromChainInfo);
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

  async checkPendingTransaction(chainName: string) {
    let transactionInfo: TransactionInfo | null = null;
    let chainInfo = this.chainInfos.get(chainName);

    if (chainInfo.txHashCache) {
      chainInfo.txHashCache = await this.store.getPendingTransaction(chainName);
    }
    if (chainInfo.txHashCache) {
      transactionInfo = await chainInfo.provider.checkPendingTransaction(
        chainInfo.txHashCache
      );
      // maybe query error
      // if confirmedBlock always zero, maybe the tx dropped from the tx pool
      if (transactionInfo === null || transactionInfo.confirmedBlock === 0) {
        chainInfo.checkTimes += 1;
        // if always query null, maybe reorg or replaced
        if (chainInfo.checkTimes >= this.maxWaitingPendingTimes) {
          this.logger.warn(
            `this tx may replaced or reorged, reset txHash ${chainInfo.txHashCache}, ${chainName}`
          );
          await this.store.delPendingTransaction(chainName);
          chainInfo.txHashCache = null;
          chainInfo.checkTimes = 0;
        }
        if (transactionInfo !== null) {
          this.logger.log(
            `the tx is pending, waiting for confirmed, txHash: ${chainInfo.txHashCache}, ${transactionInfo.confirmedBlock},  ${transactionInfo.nonce}`
          );
        }
        return true;
      } else {
        chainInfo.checkTimes = 0;
      }
      // confirmed
      if (transactionInfo.confirmedBlock > 0) {
        if (transactionInfo.confirmedBlock < 3) {
          this.logger.log(
            `waiting for tx finialize: ${transactionInfo.confirmedBlock}, txHash: ${chainInfo.txHashCache}`
          );
          return true;
        } else {
          // delete in store
          this.logger.log(
            `the pending tx is confirmed, txHash: ${chainInfo.txHashCache}`
          );
          await this.store.delPendingTransaction(chainName);
          chainInfo.txHashCache = null;
          return false;
        }
      }
    }
    return false;
  }

  private adjustClock(key: string) {
    let timer = this.timer.get(key);

    timer.lastAdjustTime += 1;
    timer.lastWithdrawLiqudity += 1;
    timer.lastUpdateDynamicFeeInterval += 1;
    timer.lastRepayLend += 1;
    if (timer.lastAdjustTime >= this.scheduleAdjustFeeInterval) {
      timer.lastAdjustTime = 0;
    }
    if (timer.lastWithdrawLiqudity >= this.withdrawLiqudityInterval) {
      timer.lastWithdrawLiqudity = 0;
    }
    if (timer.lastUpdateDynamicFeeInterval >= this.updateDynamicFeeInterval) {
      timer.lastUpdateDynamicFeeInterval = 0;
    }
    if (timer.lastRepayLend >= this.repayLendInterval) {
      timer.lastRepayLend = 0;
    }
  }

  // After triggering repay, if there is already a relay transaction, replace it.
  async repayDept(chain: string) {
    if (await this.checkPendingTransaction(chain)) {
      return false;
    }
    // get all relayers
    let relayers = [];
    for (let lnBridge of this.lnBridges.values()) {
      if (lnBridge.toBridge.chainInfo.chainName === chain) {
        for (const lnProvider of lnBridge.lnProviders) {
          if (!relayers.includes(lnProvider.relayer)) {
            relayers.push({
              address: lnProvider.relayer,
              isSafe: ["signer", "executor"].includes(lnBridge.safeWalletRole),
              isExecutor: lnBridge.safeWalletRole === "executor",
              safeWallet: lnBridge.toBridge.safeWallet,
            });
          }
        }
      }
    }
    const chainInfo = this.chainInfos.get(chain);
    for (const relayer of relayers) {
      for (const market of chainInfo.lendMarket) {
        // currently only support safeWallet
        if (!relayer.isSafe) {
          continue;
        }
        // repay debt first, if no debt, try to supply if needed
        let hint: string = "repay";
        let repayOrSupplyRawDatas = await market.batchRepayRawData(
          relayer.address
        );
        if (repayOrSupplyRawDatas.length === 0) {
          repayOrSupplyRawDatas = await market.batchSupplyRawData(
            relayer.address
          );
          if (repayOrSupplyRawDatas.length === 0) {
            continue;
          }
          hint = "supply";
        }
        this.logger.log(
          `[${chain}] balance enough, proposol to ${hint} balance`
        );
        const txInfo = await relayer.safeWallet.proposeTransaction(
          repayOrSupplyRawDatas,
          relayer.isExecutor,
          BigInt(chainInfo.chainId)
        );
        if (txInfo !== null && txInfo.readyExecute && relayer.isExecutor) {
          const safeContract = new SafeContract(
            relayer.safeWallet.address,
            relayer.safeWallet.wallet
          );
          const safeTransaction = txInfo.safeTransaction.data;
          const err = await safeContract.tryExecTransaction(
            safeTransaction.to,
            safeTransaction.data,
            BigInt(0),
            safeTransaction.operation,
            txInfo.signatures
          );
          if (err != null) {
            this.logger.warn(
              `[${chain}] try to ${hint} using safe failed, err ${err}`
            );
            continue;
          } else {
            this.logger.log(`[${chain}] ready to ${hint} using safe tx`);
            const gasPrice = await this.gasPrice(chainInfo);
            const tx = await safeContract.execTransaction(
              safeTransaction.to,
              safeTransaction.data,
              BigInt(0),
              safeTransaction.operation,
              txInfo.signatures,
              gasPrice
            );
            await this.store.savePendingTransaction(
              chainInfo.chainName,
              tx.hash
            );
            chainInfo.txHashCache = tx.hash;
            this.logger.log(
              `[${chain}] success ${hint} message, txhash: ${tx.hash}`
            );
          }
        }
        return true;
      }
    }
    return false;
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
                lnProvider.resolverOnSource,
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
            const softLimitInfo = await toBridgeContract.getSoftTransferLimit(
              lnProvider.relayer,
              lnProvider.toAddress,
              toChainInfo.provider
            );
            if (bridge.safeWalletRole === undefined) {
              softTransferLimit =
                softLimitInfo.allowance < softLimitInfo.balance
                  ? softLimitInfo.allowance
                  : softLimitInfo.balance;
            } else {
              softTransferLimit = softLimitInfo.balance;
              // from lend market
              for (const market of toChainInfo.lendMarket) {
                // first check withdraw available
                const withdrawAvailable =
                  await market.withdrawAndBorrowAvailable(
                    lnProvider.relayer,
                    lnProvider.toAddress
                  );
                let avaiable =
                  withdrawAvailable.withdraw + withdrawAvailable.borrow;
                // if can't withdraw, then borrow
                if (avaiable <= BigInt(0)) {
                  avaiable = await market.borrowAvailable(
                    lnProvider.relayer,
                    lnProvider.toAddress
                  );
                }
                if (avaiable > BigInt(0)) {
                  softTransferLimit = softLimitInfo.balance + avaiable;
                  break;
                }
              }
            }
          } catch (e) {
            // ignore error
            // this time don't send heartbeat
            continue;
          }
          await this.dataworkerService.sendHeartBeat(
            this.configureService.indexer,
            fromChainInfo.chainId,
            toChainInfo.chainId,
            lnProvider.resolverOnSource,
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
        if (
          await this.checkPendingTransaction(
            bridge.toBridge.chainInfo.chainName
          )
        ) {
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
      if (lnProvider.fromTokenDecimals === -1) {
        lnProvider.fromTokenDecimals = await lnProvider.fromToken.decimals();
      }
      let srcDecimals = lnProvider.fromTokenDecimals;
      if (lnProvider.useDynamicBaseFee && needUpdateDynamicFee) {
        if (nativeFeeUsed <= 0) {
          let gasPrice = await toChainInfo.provider.feeData(
            1,
            toChainInfo.notSupport1559
          );
          nativeFeeUsed = this.dataworkerService.relayFee(gasPrice);
        }
        const dynamicBaseFee = nativeFeeUsed * BigInt(lnProvider.swapRate);

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
          lnProvider.resolverOnSource,
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
          const needWithdrawRecords =
            await this.dataworkerService.queryLiquidity(
              this.configureService.indexer,
              fromChainInfo.chainName,
              toChainInfo.chainName,
              lnProvider.resolverOnSource,
              lnProvider.toAddress,
              lnProvider.withdrawLiquidityAmountThreshold,
              lnProvider.withdrawLiquidityCountThreshold,
              srcDecimals
            );
          if (needWithdrawRecords != null) {
            const fromLnv3Contract = fromBridgeContract as Lnv3BridgeContract;
            const toLnv3Contract = toBridgeContract as Lnv3BridgeContract;
            // filter unwithdrawn transferIds on chain
            let args: MulticallArgs[] = [];
            for (const transferId of needWithdrawRecords.transferIds) {
              args.push({
                address: fromLnv3Contract.address,
                data: fromLnv3Contract.encodeLockInfo(transferId),
              });
            }
            const response = await fromChainInfo.multicall.aggregate(args);
            const lockInfos = response?.[1] ?? [];
            let filterTransferIds = [];
            let index = 0;
            let totalAmount = BigInt(0);
            for (const lockInfo of lockInfos) {
              const [amountWithFeeAndPenalty, tokenIndex, txStatus] =
                AbiCoder.defaultAbiCoder().decode(
                  ["uint", "uint", "uint"],
                  lockInfo
                );
              if (Number(txStatus) === 1) {
                if (filterTransferIds.length < kMaxWithdrawTransferCount) {
                  filterTransferIds.push(
                    needWithdrawRecords.transferIds[index]
                  );
                }
                totalAmount += amountWithFeeAndPenalty;
              }
              index++;
            }
            let countThreshold = lnProvider.withdrawLiquidityCountThreshold;
            if (!countThreshold || countThreshold > kMaxWithdrawTransferCount) {
              countThreshold = kMaxWithdrawTransferCount;
            }
            let amountThreshold = kMaxWithdrawTransferAmount;
            if (lnProvider.withdrawLiquidityAmountThreshold) {
              amountThreshold = lnProvider.withdrawLiquidityAmountThreshold;
            }
            if (
              filterTransferIds.length >= countThreshold ||
              Number(totalAmount) / Number(new Any(1, srcDecimals).Number) >=
                amountThreshold
            ) {
              // token transfer direction fromChain -> toChain
              // withdrawLiquidity message direction toChain -> fromChain
              const fromChannelAddress =
                this.configureService.getMessagerAddress(
                  fromChainInfo.chainName,
                  needWithdrawRecords.channel
                );
              const toChannelAddress = this.configureService.getMessagerAddress(
                toChainInfo.chainName,
                needWithdrawRecords.channel
              );
              const messager = messagerInstance(
                needWithdrawRecords.channel,
                toChannelAddress,
                bridge.toWallet
              );
              const appPayload = toLnv3Contract.encodeWithdrawLiquidity(
                filterTransferIds,
                toChainInfo.chainId,
                lnProvider.resolverOnSource
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
                fromChannelAddress,
                payload,
                lnProvider.relayer
              );
              const err = await toLnv3Contract.tryWithdrawLiquidity(
                fromChainInfo.chainId,
                filterTransferIds,
                lnProvider.resolverOnSource,
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
                  }, info: ${JSON.stringify(filterTransferIds)}, fee: ${
                    params.fee
                  }`
                );
                let gasPrice = await toChainInfo.provider.feeData(
                  1.1,
                  toChainInfo.notSupport1559
                );
                const tx = await toLnv3Contract.withdrawLiquidity(
                  fromChainInfo.chainId,
                  filterTransferIds,
                  lnProvider.resolverOnSource,
                  params.extParams,
                  gasPrice,
                  params.fee
                );
                this.logger.log(
                  `withdrawLiquidity tx ${tx.hash} on ${toChainInfo.chainId}`
                );
              }
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
        lnProvider.resolverOnSource,
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
      const txValid = await this.dataworkerService.checkValid(
        this.configureService.indexer,
        record,
        fromBridgeContract,
        toBridgeContract,
        fromChainInfo.provider,
        bridge.reorgThreshold,
        bridge.microReorgThreshold,
        new Any(lnProvider.microThreshold, srcDecimals).Number,
        bridge.toWallet
      );

      if (!txValid) {
        continue;
      }

      let gasPrice = await this.gasPrice(toChainInfo);
      let feeUsed = this.dataworkerService.relayFee(gasPrice);
      if (feeUsed > new Ether(bridge.feeLimit).Number) {
        this.logger.log(`fee is exceed limit, please check, fee ${feeUsed}`);
        continue;
      }
      let nonce: number | null = null;
      // try relay: check balance and fee enough
      const targetAmount = new EtherBigNumber(record.recvAmount).Number;
      const relayBySelf = lnProvider.resolverOnSource === lnProvider.relayer;
      const args: RelayArgs | RelayArgsV3 =
        bridge.bridgeType != "lnv3"
          ? {
              transferParameter: {
                previousTransferId: needRelayRecord.lastTransferId,
                relayer: lnProvider.resolverOnSource,
                sourceToken: lnProvider.fromAddress,
                targetToken: lnProvider.toAddress,
                amount: targetAmount,
                timestamp: new EtherBigNumber(record.startTime).Number,
                receiver: record.recipient,
              },
              remoteChainId: fromChainInfo.chainId,
              expectedTransferId: last(record.id.split("-")),
              relayBySelf: relayBySelf,
            }
          : {
              transferParameter: {
                remoteChainId: fromChainInfo.chainId,
                provider: lnProvider.resolverOnSource,
                sourceToken: lnProvider.fromAddress,
                targetToken: lnProvider.toAddress,
                sourceAmount: new EtherBigNumber(record.sendAmount).Number,
                targetAmount: targetAmount,
                receiver: record.recipient,
                timestamp: new EtherBigNumber(record.messageNonce).Number,
              },
              expectedTransferId: last(record.id.split("-")),
              relayBySelf: relayBySelf,
            };
      const configuredGasLimit = toChainInfo.relayGasLimit;
      const relayGasLimit =
        configuredGasLimit !== undefined
          ? new EtherBigNumber(configuredGasLimit).Number
          : null;

      const isExecutor = bridge.safeWalletRole === "executor";
      if (bridge.safeWalletRole === "signer" || isExecutor) {
        const relayData = toBridgeContract.relayRawData(args);
        // txs
        // 1. balance is enough to pay for relay
        let reservedBalance: bigint;
        // native token
        if (lnProvider.toAddress === zeroAddress) {
          reservedBalance = await toChainInfo.provider.balanceOf(
            lnProvider.relayer
          );
        } else {
          reservedBalance = await lnProvider.toToken.balanceOf(
            lnProvider.relayer
          );
        }
        let txs = [];
        // relay directly
        if (reservedBalance >= targetAmount) {
          if (lnProvider.toAddress !== zeroAddress) {
            txs.push({
              to: lnProvider.toAddress,
              value: "0",
              data: lnProvider.toToken.approveRawData(
                toBridgeContract.address,
                targetAmount
              ),
            });
          }
          txs.push({
            to: toBridgeContract.address,
            value: (relayData.value ?? BigInt(0)).toString(),
            data: relayData.data,
          });
        } else {
          // search from lend market
          const needLending = targetAmount - reservedBalance;
          for (const market of toChainInfo.lendMarket) {
            txs = await market.lendingFromPoolTxs(
              lnProvider.toAddress,
              needLending,
              lnProvider.relayer
            );
            if (txs.length > 0) {
              if (lnProvider.toAddress !== zeroAddress) {
                //approve
                txs.push({
                  to: lnProvider.toAddress,
                  value: "0",
                  data: lnProvider.toToken.approveRawData(
                    toBridgeContract.address,
                    targetAmount
                  ),
                });
              }
              // relay
              txs.push({
                to: toBridgeContract.address,
                value: (relayData.value ?? BigInt(0)).toString(),
                data: relayData.data,
              });
              break;
            }
          }
        }
        if (txs.length == 0) {
          continue;
        }
        const txInfo = await bridge.toBridge.safeWallet.proposeTransaction(
          txs,
          isExecutor,
          BigInt(toChainInfo.chainId)
        );
        if (txInfo !== null && txInfo.readyExecute && isExecutor) {
          const safeContract = new SafeContract(
            bridge.toBridge.safeWallet.address,
            bridge.toBridge.safeWallet.wallet
          );
          const safeTransaction = txInfo.safeTransaction.data;
          const err = await safeContract.tryExecTransaction(
            safeTransaction.to,
            safeTransaction.data,
            BigInt(safeTransaction.value),
            safeTransaction.operation,
            txInfo.signatures,
            relayGasLimit
          );
          if (err != null) {
            this.logger.warn(
              `[${fromChainInfo.chainName}>>${toChainInfo.chainName}] try to relay using safe failed, id: ${record.id}, gasLimit ${relayGasLimit}, err ${err}`
            );
            continue;
          } else {
            this.logger.log(
              `[${fromChainInfo.chainName}>>${
                toChainInfo.chainName
              }] ready to exec safe tx, id: ${
                record.id
              }, gasPrice: ${gasPriceToString(
                gasPrice
              )}, gasLimit: ${relayGasLimit}`
            );
            const tx = await safeContract.execTransaction(
              safeTransaction.to,
              safeTransaction.data,
              BigInt(safeTransaction.value),
              safeTransaction.operation,
              txInfo.signatures,
              gasPrice,
              null,
              relayGasLimit
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
            await this.dataworkerService.updateConfirmedBlock(
              this.configureService.indexer,
              record.id,
              record.relayer,
              `${tx.hash}`,
              bridge.toWallet
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
          `find valid relay info, id: ${record.id}, nonce: ${nonce}, toChain ${
            toChainInfo.chainName
          }, gasPrice ${gasPriceToString(gasPrice)}`
        );
        // relay and return
        const tx = await toBridgeContract.relay(
          args,
          gasPrice,
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
