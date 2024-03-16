import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Chain, MessagerInfo, BaseConfigure, BaseConfigService } from "./base.service";
import * as fs from "fs";

/*
{
    indexer: "http://localhost:4002/graphql",
    rpcnodes: [
        {
            name: 'arbitrum',
            rpc: "https://arb1.arbitrum.io/rpc",
            fixedGasPrice: 10
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

export interface RpcNode {
  name: string;
  rpc: string;
  fixedGasPrice: number;
  notSupport1559: boolean;
}

export interface TokenInfo {
  symbol: string;
  swapRate: number;
  withdrawLiquidityAmountThreshold: number;
  withdrawLiquidityCountThreshold: number;
}

export interface BridgeInfo {
  direction: string;
  encryptedPrivateKey: string;
  feeLimit: number;
  bridgeType: string;
  reorgThreshold: number;
  safeWalletAddress: string | undefined;
  safeWalletUrl: string | undefined;
  safeWalletRole: string | undefined;
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
  private readonly configPath =
    this.configService.get<string>("LP_BRIDGE_PATH");
  public readonly storePath = this.configService.get<string>(
    "LP_BRIDGE_STORE_PATH"
  );
  public config: ConfigInfo = JSON.parse(
    fs.readFileSync(this.configPath, "utf8")
  );
  public baseConfig: BaseConfigure;
  constructor(
    private configService: ConfigService,
    private baseService: BaseConfigService
  ) {
    this.baseConfig = this.baseService.baseConfigure(
      this.config.env === "test"
    );
  }

  public getChainInfo(name: string): Chain | null {
    return this.baseConfig.chains.find((chain) => chain.name === name);
  }

  public getMessagerAddress(chainName: string, channelName: string): MessagerInfo | null {
      const chain = this.getChainInfo(chainName);
      if (chain === null) return null;
      return chain.messagers.find((messager) => messager.name === channelName);
  }

  get indexer(): string {
    return this.config.indexer ?? this.baseConfig.indexer;
  }

  get supportedChains(): string[] {
    return this.baseConfig.chains.map((item) => item.name);
  }
}
