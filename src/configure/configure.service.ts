import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as fs from "fs";

export interface ChainConfigInfo {
  name: string;
  rpc: string;
  native: string;
}

export interface TokenConfigInfo {
  chainName: string;
  fromAddress: string;
  feeTokenAddress: string;
}

export interface ChainWithTokenInfo {
  toAddress: string;
  fromAddresses: TokenConfigInfo[];
}

export interface BridgeConfigInfo {
  privateKey: string;
  toChain: string;
  minProfit: string;
  bridgeAddress: string;
  tokens: ChainWithTokenInfo[];
  priceOracle: {
    name: string;
    chainName: string;
    relayerGasFeeToken: string;
    configure: any;
  };
}

export interface ConfigInfo {
  indexer: string;
  relayGasLimit: number;
  chains: ChainConfigInfo[];
  bridges: BridgeConfigInfo[];
}

@Injectable()
export class ConfigureService {
  private readonly configPath =
    this.configService.get<string>("LP_BRIDGE_PATH");
  public readonly storePath = this.configService.get<string>(
    "LP_BRIDGE_STORE_PATH"
  );
  public readonly config: ConfigInfo = JSON.parse(
    fs.readFileSync(this.configPath, "utf8")
  );
  constructor(private configService: ConfigService) {}
}
