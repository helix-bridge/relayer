import { Injectable } from "@nestjs/common";
import { HelixChain, HelixChainConf } from "@helixbridge/helixconf";

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
