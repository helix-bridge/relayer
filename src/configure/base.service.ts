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
  lnv2DefaultAddress: string | undefined | null;
  lnv2OppositeAddress: string | undefined | null;
  lnv3Address: string | undefined | null;
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
        name: "arbitrum",
        id: 42161,
        lnv2DefaultAddress: "0x94C614DAeFDbf151E1BB53d6A201ae5fF56A9337",
        lnv2OppositeAddress: "0x48d769d5C7ff75703cDd1543A1a2ed9bC9044A23",
        lnv3Address: "0xbA5D580B18b6436411562981e02c8A9aA1776D10",
        tokens: [
          {
            symbol: "eth",
            address: "0x0000000000000000000000000000000000000000",
          },
          {
            symbol: "usdt",
            address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
          },
          {
            symbol: "usdc",
            address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
          },
          {
            symbol: "ring",
            address: "0x9e523234D36973f9e38642886197D023C88e307e",
          },
        ],
      },
      {
        name: "ethereum",
        id: 1,
        lnv2DefaultAddress: "0x94C614DAeFDbf151E1BB53d6A201ae5fF56A9337",
        lnv2OppositeAddress: "0x48d769d5C7ff75703cDd1543A1a2ed9bC9044A23",
        lnv3Address: "0xbA5D580B18b6436411562981e02c8A9aA1776D10",
        tokens: [
          {
            symbol: "ring",
            address: "0x9469D013805bFfB7D3DEBe5E7839237e535ec483",
          },
        ],
      },
      {
        name: "polygon",
        id: 137,
        lnv2DefaultAddress: "0x94C614DAeFDbf151E1BB53d6A201ae5fF56A9337",
        lnv2OppositeAddress: null,
        lnv3Address: "0xbA5D580B18b6436411562981e02c8A9aA1776D10",
        tokens: [
          {
            symbol: "ring",
            address: "0x9C1C23E60B72Bc88a043bf64aFdb16A02540Ae8f",
          },
          {
            symbol: "usdt",
            address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
          },
        ],
      },
      {
        name: "darwinia-dvm",
        id: 46,
        lnv2DefaultAddress: "0x94C614DAeFDbf151E1BB53d6A201ae5fF56A9337",
        lnv2OppositeAddress: null,
        lnv3Address: "0xbA5D580B18b6436411562981e02c8A9aA1776D10",
        tokens: [
          {
            symbol: "ring",
            address: "0x0000000000000000000000000000000000000000",
          },
          {
            symbol: "crab",
            address: "0x656567Eb75b765FC320783cc6EDd86bD854b2305",
          },
        ],
      },
      {
        name: "crab-dvm",
        id: 44,
        lnv2DefaultAddress: "0x94C614DAeFDbf151E1BB53d6A201ae5fF56A9337",
        lnv2OppositeAddress: null,
        lnv3Address: "0xbA5D580B18b6436411562981e02c8A9aA1776D10",
        tokens: [
          {
            symbol: "crab",
            address: "0x0000000000000000000000000000000000000000",
          },
          {
            symbol: "ring",
            address: "0x273131F7CB50ac002BDd08cA721988731F7e1092",
          },
        ],
      },
      {
        name: "mantle",
        id: 5000,
        lnv2DefaultAddress: "0x94C614DAeFDbf151E1BB53d6A201ae5fF56A9337",
        lnv2OppositeAddress: null,
        lnv3Address: "0xbA5D580B18b6436411562981e02c8A9aA1776D10",
        tokens: [
          {
            symbol: "usdt",
            address: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE",
          },
          {
            symbol: "usdc",
            address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
          },
        ],
      },
      {
        name: "zksync",
        id: 324,
        lnv2DefaultAddress: "0x767Bc046c989f5e63683fB530f939DD34b91ceAC",
        lnv2OppositeAddress: null,
        lnv3Address: null,
        tokens: [
          {
            symbol: "usdt",
            address: "0x493257fD37EDB34451f62EDf8D2a0C418852bA4C",
          },
          {
            symbol: "usdc",
            address: "0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4",
          },
        ],
      },
      {
        name: "scroll",
        id: 534352,
        lnv2DefaultAddress: "0x767Bc046c989f5e63683fB530f939DD34b91ceAC",
        lnv2OppositeAddress: null,
        lnv3Address: "0xbA5D580B18b6436411562981e02c8A9aA1776D10",
        tokens: [
          {
            symbol: "usdt",
            address: "0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df",
          },
          {
            symbol: "usdc",
            address: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4",
          },
        ],
      },
      {
        name: "bsc",
        id: 56,
        lnv2DefaultAddress: "0x767Bc046c989f5e63683fB530f939DD34b91ceAC",
        lnv2OppositeAddress: null,
        lnv3Address: "0xbA5D580B18b6436411562981e02c8A9aA1776D10",
        tokens: [
          {
            symbol: "usdt",
            address: "0x55d398326f99059fF775485246999027B3197955",
          },
          {
            symbol: "usdc",
            address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
          },
        ],
      },
      {
        name: "linea",
        id: 59144,
        lnv2DefaultAddress: "0x767Bc046c989f5e63683fB530f939DD34b91ceAC",
        lnv2OppositeAddress: null,
        lnv3Address: "0xbA5D580B18b6436411562981e02c8A9aA1776D10",
        tokens: [
          {
            symbol: "eth",
            address: "0x0000000000000000000000000000000000000000",
          },
          {
            symbol: "usdt",
            address: "0xA219439258ca9da29E9Cc4cE5596924745e12B93",
          },
        ],
      },
      {
        name: "op",
        id: 10,
        lnv2DefaultAddress: "0x767Bc046c989f5e63683fB530f939DD34b91ceAC",
        lnv2OppositeAddress: null,
        lnv3Address: "0xbA5D580B18b6436411562981e02c8A9aA1776D10",
        tokens: [
          {
            symbol: "usdt",
            address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
          },
        ],
      },
      {
        name: "gnosis",
        id: 100,
        lnv2DefaultAddress: "0x767Bc046c989f5e63683fB530f939DD34b91ceAC",
        lnv2OppositeAddress: null,
        lnv3Address: "0xbA5D580B18b6436411562981e02c8A9aA1776D10",
        tokens: [
          {
            symbol: "usdt",
            address: "0x4ECaBa5870353805a9F068101A40E0f32ed605C6",
          },
        ],
      },
      {
        name: "blast",
        id: 81457,
        lnv2DefaultAddress: null,
        lnv2OppositeAddress: null,
        lnv3Address: "0xB180D7DcB5CC161C862aD60442FA37527546cAFC",
        tokens: [
          {
            symbol: "eth",
            address: "0x0000000000000000000000000000000000000000",
          },
        ],
      }
    ],
  };
  testConfigure: BaseConfigure = {
    indexer: "https://apollo-test.helixbridge.app/graphql",
    chains: [
      {
        name: "arbitrum-sepolia",
        id: 421614,
        lnv2DefaultAddress: "0x8429D7Dfd91D6F970ba89fFC005e67D15f1E4739",
        lnv2OppositeAddress: "0xbA96d83E2A04c4E50F2D6D7eCA03D70bA2426e5f",
        lnv3Address: "0x38627Cb033De66a1E07e73f5D0a7a7adFB6741fa",
        tokens: [
          {
            symbol: "usdt",
            address: "0x3b8Bb7348D4F581e67E2498574F73e4B9Fc51855",
          },
          {
            symbol: "usdc",
            address: "0x8A87497488073307E1a17e8A12475a94Afcb413f",
          },
          {
            symbol: "eth",
            address: "0x0000000000000000000000000000000000000000",
          },
        ],
      },
      {
        name: "sepolia",
        id: 11155111,
        lnv2DefaultAddress: "0x8429D7Dfd91D6F970ba89fFC005e67D15f1E4739",
        lnv2OppositeAddress: "0xbA96d83E2A04c4E50F2D6D7eCA03D70bA2426e5f",
        lnv3Address: "0x38627Cb033De66a1E07e73f5D0a7a7adFB6741fa",
        tokens: [
          {
            symbol: "usdt",
            address: "0x876A4f6eCF13EEb101F9E75FCeF58f19Ff383eEB",
          },
          {
            symbol: "usdc",
            address: "0x0ac58Df0cc3542beC4cDa71B16D06C3cCc39f405",
          },
          {
            symbol: "eth",
            address: "0x0000000000000000000000000000000000000000",
          },
        ],
      },
      {
        name: "zksync-sepolia",
        id: 300,
        lnv2DefaultAddress: "0xBe23e871318E49C747CB909AC65aCCFAEAac3a37",
        lnv2OppositeAddress: undefined,
        lnv3Address: "0xDc55fF59F82AA50D8A4A61dB8CcaDffD26Fb7dD2",
        tokens: [
          {
            symbol: "usdt",
            address: "0x3350f1ef046e21E052dCbA60Fc575919CCaFEdeb",
          },
          {
            symbol: "usdc",
            address: "0x253adBFE99Fcd096B9b5502753F96CF78D42eaD0",
          },
          {
            symbol: "eth",
            address: "0x0000000000000000000000000000000000000000",
          },
        ],
      },
    ],
  };

  isTest: boolean;

  constructor() {}

  public baseConfigure(isTest: boolean): BaseConfigure {
    return isTest ? this.testConfigure : this.formalConfigure;
  }
}
