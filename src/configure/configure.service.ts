import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HelixChainConf } from "@helixbridge/helixconf";
import { BaseConfigure, BaseConfigService } from "./base.service";
import * as fs from "fs";

/*
{
    indexer: "http://localhost:4002/graphql",
    rpcnodes: [
        {
            name: 'arbitrum',
            rpc: "https://arb1.arbitrum.io/rpc",
            fixedGasPrice: 10,
            lendMarket: [
              {
                protocol: "aave",
                symbol: "weth",
                minRepay: 0.01,
                minReserved: 0
              }
            ]
        }
    ],
    bridges: [
        {
            direction: "arbitrum->polygon",
            encryptedPrivateKey: "xxxxx",
            feeLimit: 100,
            bridgeType: "lnv3",
            reorgThreshold: 10,
            tokens: [
                {
                    symbol: "usdt->usdt",
                    swapRate: 2300
                }
            ]
        }
    ]
}
*/

export interface LendTokenInfo {
  symbol: string;
  minRepay: number;
  minReserved: number;
}

export interface CollateralInfo {
  symbol: string;
  autosupplyAmount: number;
}

export interface LendInfo {
  protocol: string;
  healthFactorLimit: number;
  collaterals: CollateralInfo[];
  tokens: LendTokenInfo[];
}

export interface RpcNode {
  name: string;
  rpcs: string[];
  fixedGasPrice: number;
  notSupport1559: boolean;
  lendMarket: LendInfo[];
}

export interface TokenInfo {
  symbol: string;
  microThreshold: number | undefined;
  swapRate: number;
  withdrawLiquidityAmountThreshold: number;
  withdrawLiquidityCountThreshold: number;
  useDynamicBaseFee: boolean;
}

export interface BridgeInfo {
  direction: string;
  encryptedPrivateKey: string;
  encryptedCeramicKey: string | undefined;
  feeLimit: number;
  bridgeType: string;
  reorgThreshold: number;
  microReorgThreshold: number | undefined;
  safeWalletAddress: string | undefined;
  safeWalletUrl: string | undefined;
  safeWalletRole: string | undefined;
  safeWalletType: "gnosis" | "ceramic" | "single" | undefined;
  minProfit: number;
  maxProfit: number;
  tokens: TokenInfo[];
}

export interface ConfigInfo {
  env: string;
  indexer: string;
  relayGasLimit: number;
  rpcnodes: RpcNode[];
  bridges: BridgeInfo[];
}

@Injectable()
export class ConfigureService {
  private readonly configPath: string;
  public readonly storePath: string;
  public config: ConfigInfo;
  public baseConfig: BaseConfigure;

  constructor(
    private configService: ConfigService,
    private baseService: BaseConfigService
  ) {
    this.configPath = this.configService.get<string>("LP_BRIDGE_PATH");
    this.config = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
    this.storePath = this.configService.get<string>("LP_BRIDGE_STORE_PATH");
    this.baseConfig = this.baseService.baseConfigure(
      this.config.env === "test"
    );
  }

  public getChainInfo(name: string): HelixChainConf | null {
    return this.baseConfig.chains.find((chain) => chain.code === name);
  }

  public getMessagerAddress(
    chainName: string,
    channelName: string
  ): string | null {
    const chain = this.getChainInfo(chainName);
    if (chain === null) return null;
    return chain.messagers.find((messager) => messager.name === channelName)
      ?.address;
  }

  get indexer(): string {
    return this.config.indexer ?? this.baseConfig.indexer;
  }

  get supportedChains(): string[] {
    return this.baseConfig.chains.map((item) => item.code);
  }
}
