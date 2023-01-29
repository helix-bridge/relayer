import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';

export interface BridgeConfigInfo {
    chainName: string;
    rpc: string;
    bridgeAddress: string;
    tokenAddress: string;
    native?: string;
}

export interface ConfigInfo {
    privateKey: string;
    toChain: BridgeConfigInfo;
    fromChains: BridgeConfigInfo[];
    priceOracle: {
        name: string;
        chainName: string;
        userFeeToken: string;
        relayerGasFeeToken: string;
        configure: any;
    };
}

@Injectable()
export class ConfigureService {
    private readonly configPath = this.configService.get<string>('LP_BRIDGE_PATH');
    public readonly indexer = this.configService.get<string>('LP_INDEXER_URL');
    public readonly relayGasLimit = this.configService.get<string>('LP_RELAY_GASLIMIT');
    public readonly storePath = this.configService.get<string>('LP_BRIDGE_STORE_PATH');
    public readonly config: ConfigInfo[] = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
    constructor(
        private configService: ConfigService,
    ) { }
}
