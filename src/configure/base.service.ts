import { Injectable } from "@nestjs/common";

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
    lnv2DefaultAddress: string | undefined;
    lnv2OppositeAddress: string | undefined;
    lnv3Address: string | undefined;
    tokens: TokenInfo[];
}

export interface BaseConfigure {
    indexer: string;
    chains: Chain[];
}

@Injectable()
export class BaseConfigService {
  formalConfigure: BaseConfigure = {
      indexer: "https://apollo.helixbridge.app/graphql",
      chains: [
          {
              name: 'arbitrum-sepolia',
              id: 421614,
              lnv2DefaultAddress: '0x8429D7Dfd91D6F970ba89fFC005e67D15f1E4739',
              lnv2OppositeAddress: '0xbA96d83E2A04c4E50F2D6D7eCA03D70bA2426e5f',
              lnv3Address: '0x38627Cb033De66a1E07e73f5D0a7a7adFB6741fa',
              tokens: [
                  {
                      symbol: 'usdt',
                      address: '0x3b8Bb7348D4F581e67E2498574F73e4B9Fc51855',
                  },
                  {
                      symbol: 'usdc',
                      address:'0x8A87497488073307E1a17e8A12475a94Afcb413f',
                  }
              ]
          }
      ],
  };
  testConfigure: BaseConfigure = {
      indexer: "https://apollo-test.helixbridge.app/graphql",
      chains: [
          {
              name: 'arbitrum-sepolia',
              id: 421614,
              lnv2DefaultAddress: '0x8429D7Dfd91D6F970ba89fFC005e67D15f1E4739',
              lnv2OppositeAddress: '0xbA96d83E2A04c4E50F2D6D7eCA03D70bA2426e5f',
              lnv3Address: '0x38627Cb033De66a1E07e73f5D0a7a7adFB6741fa',
              tokens: [
                  {
                      symbol: 'usdt',
                      address: '0x3b8Bb7348D4F581e67E2498574F73e4B9Fc51855',
                  },
                  {
                      symbol: 'usdc',
                      address:'0x8A87497488073307E1a17e8A12475a94Afcb413f',
                  },
                  {
                      symbol: 'eth',
                      address:'0x0000000000000000000000000000000000000000'
                  }
              ]
          },
          {
              name: 'sepolia',
              id: 11155111,
              lnv2DefaultAddress: '0x8429D7Dfd91D6F970ba89fFC005e67D15f1E4739',
              lnv2OppositeAddress: '0xbA96d83E2A04c4E50F2D6D7eCA03D70bA2426e5f',
              lnv3Address: '0x38627Cb033De66a1E07e73f5D0a7a7adFB6741fa',
              tokens: [
                  {
                      symbol: 'usdt',
                      address: '0x876A4f6eCF13EEb101F9E75FCeF58f19Ff383eEB',
                  },
                  {
                      symbol: 'usdc',
                      address:'0x0ac58Df0cc3542beC4cDa71B16D06C3cCc39f405',
                  },
                  {
                      symbol: 'eth',
                      address:'0x0000000000000000000000000000000000000000'
                  }
              ]
          },
          {
              name: 'zksync-sepolia',
              id: 300,
              lnv2DefaultAddress: '0xBe23e871318E49C747CB909AC65aCCFAEAac3a37',
              lnv2OppositeAddress: undefined,
              lnv3Address: '0xDc55fF59F82AA50D8A4A61dB8CcaDffD26Fb7dD2',
              tokens: [
                  {
                      symbol: 'usdt',
                      address: '0x3350f1ef046e21E052dCbA60Fc575919CCaFEdeb',
                  },
                  {
                      symbol: 'usdc',
                      address:'0x253adBFE99Fcd096B9b5502753F96CF78D42eaD0',
                  },
                  {
                      symbol: 'eth',
                      address:'0x0000000000000000000000000000000000000000'
                  }
              ]
          }
      ]
  }

  isTest: boolean;

  constructor() {}

  public baseConfigure(isTest: boolean): BaseConfigure {
    return isTest ? this.testConfigure : this.formalConfigure;
  }
}
