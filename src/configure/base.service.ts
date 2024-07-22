import { Injectable } from "@nestjs/common";
import { HelixChain, HelixChainConf } from "@helixbridge/helixconf";

// lnv2 default address
// lnv2 opposite address
// lnv3 address
// token symbol => token address
// indexer address
// chainName => chainId
export interface TokenInfo {
  symbol: string;
  address: string;
}

export interface Chain {
  name: string;
  id: number;
  lnv2DefaultAddress: string | undefined | null;
  lnv2OppositeAddress: string | undefined | null;
  lnv3Address: string | undefined | null;
  messagers: MessagerInfo[];
  tokens: TokenInfo[];
}

export interface MessagerInfo {
  name: string;
  address: string;
}

export interface BaseConfigure {
  indexer: string;
  chains: HelixChainConf[];
}

@Injectable()
export class BaseConfigService {
  formalConfigure: BaseConfigure = {
    indexer: "https://apollo.helixbridge.app/graphql",
    chains: [
      HelixChain.arbitrum,
      HelixChain.ethereum,
      HelixChain.polygon,
      HelixChain.darwiniaDvm,
      HelixChain.crabDvm,
      HelixChain.mantle,
      HelixChain.zksync,
      HelixChain.scroll,
      HelixChain.bsc,
      HelixChain.linea,
      HelixChain.op,
      HelixChain.gnosis,
      HelixChain.blast,
      HelixChain.astarZkevm,
      HelixChain.moonbeam,
    ],
  };
  testConfigure: BaseConfigure = {
    indexer: "https://apollo-test.helixbridge.app/graphql",
    chains: [
      HelixChain.arbitrumSepolia,
      HelixChain.sepolia,
      HelixChain.zksyncSepolia,
      HelixChain.taikoHekla,
      HelixChain.bera,
      HelixChain.morph,
      HelixChain.baseSepolia,
    ],
  };

  isTest: boolean;

  constructor() {}

  public baseConfigure(isTest: boolean): BaseConfigure {
    return isTest ? this.testConfigure : this.formalConfigure;
  }
}
