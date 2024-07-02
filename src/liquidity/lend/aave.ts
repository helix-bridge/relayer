import { Wallet, HDNodeWallet, ethers } from "ethers";
import { AaveOracle, AaveL2Pool } from "./contract";
import { MulticallContract, zeroAddress } from "../../base/contract";
import { LendMarket } from "./market";
import { LendTokenInfo } from "../../configure/configure.service";
import { Any } from "../../base/bignumber";

export interface DeptToken {
  address: string;
  decimals: number;
  underlyingAddress: string;
  // the min repay amount each time
  minRepayAmount: bigint;
  // the min reserved underlying balance
  minReserved: bigint;
}

export interface WaitingRepayInfo {
  token: DeptToken;
  amount: bigint;
}

export interface DepotTokenBook {
  symbol: string;
  decimals: number;
  vToken: string;
  underlyingToken: string;
  isNativeWrapped: boolean;
}

export interface ChainInfo {
  name: string;
  l2Pool: string;
  oracle: string;
  multicall: string;
  deptTokens: DepotTokenBook[];
}

export interface AddressBook {
  version: string;
  chains: ChainInfo[];
}

export class AddressBookConfigure {
  formalConfigure: AddressBook = {
    version: "v3",
    chains: [
      {
        name: "arbitrum",
        l2Pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
        oracle: "0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7",
        multicall: "0xcA11bde05977b3631167028862bE2a173976CA11",
        // find at https://github.com/bgd-labs/aave-address-book/blob/main/src/AaveV3Arbitrum.sol
        deptTokens: [
          {
            symbol: "usdt",
            vToken: "0xfb00AC187a8Eb5AFAE4eACE434F493Eb62672df7",
            underlyingToken: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
            decimals: 6,
            isNativeWrapped: false,
          },
          {
            symbol: "weth",
            vToken: "0x0c84331e39d6658Cd6e6b9ba04736cC4c4734351",
            underlyingToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
            decimals: 18,
            isNativeWrapped: true,
          },
        ],
      },
    ],
  };

  testConfigure: AddressBook = {
    version: "v3",
    chains: [
      {
        name: "base-sepolia",
        l2Pool: "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b",
        oracle: "0x29E1eF0209275D0F403E8C57861C2df8706eA244",
        multicall: "0xcA11bde05977b3631167028862bE2a173976CA11",
        // find at https://github.com/bgd-labs/aave-address-book/blob/main/src/AaveV3Arbitrum.sol
        deptTokens: [
          {
            symbol: "weth",
            vToken: "0xf0F0025Dc51f532Ab84c33Eb9d01583EAa0F74c7",
            underlyingToken: "0x4200000000000000000000000000000000000006",
            decimals: 18,
            isNativeWrapped: true,
          },
        ],
      },
    ]
  };

  public addressBook(isTest: boolean): AddressBook {
    return isTest ? this.testConfigure : this.formalConfigure;
  }
}

export class Aave extends LendMarket {
  public healthFactorLimit: number;
  public poolContract: AaveL2Pool;
  public oracle: AaveOracle;
  public multicall: MulticallContract;

  public debtTokens: DeptToken[];

  constructor(
    chainName: string,
    healthFactorLimit: number,
    tokens: LendTokenInfo[],
    signer: Wallet | HDNodeWallet | ethers.Provider
  ) {
    const addressBook = new AddressBookConfigure().addressBook(true);
    const bookInfo = addressBook.chains.find((e) => e.name == chainName);
    if (!bookInfo) {
        throw new Error(`[Lend]Chain ${chainName} Not Support`);
    }
    const wtoken = bookInfo.deptTokens.find((dt) => dt.isNativeWrapped);
    super("aave", wtoken?.underlyingToken);

    this.healthFactorLimit = healthFactorLimit;
    this.poolContract = new AaveL2Pool(bookInfo.l2Pool, signer);
    this.oracle = new AaveOracle(bookInfo.oracle, signer);
    this.multicall = new MulticallContract(bookInfo.multicall, signer);
    if (!tokens) {
        throw new Error(`[Lend]Chain ${chainName} tokens empty`);
    }
    this.debtTokens = tokens.map((token) => {
      const tokenInfo = bookInfo.deptTokens.find(
        (dt) => dt.symbol == token.symbol
      );
      return {
        address: tokenInfo.vToken,
        underlyingAddress: tokenInfo.underlyingToken,
        decimals: tokenInfo.decimals,
        minRepayAmount:
          (BigInt((token.minRepay * 10000).toFixed()) *
            new Any(1, tokenInfo.decimals).Number) /
          BigInt(10000),
        minReserved:
          (BigInt((token.minReserved * 10000).toFixed()) *
            new Any(1, tokenInfo.decimals).Number) /
          BigInt(10000),
      };
    });
  }

  // suppose the pool is big enough
  async borrowAvailable(account: string, asset: string): Promise<bigint> {
    if (asset == zeroAddress && !this.wrappedToken) {
      return BigInt(0);
    }
    const dtToken = this.debtTokens.find(
      (dt) =>
        dt.underlyingAddress == asset ||
        (asset == zeroAddress && dt.underlyingAddress == this.wrappedToken)
    );
    // not support this token
    if (this.healthFactorLimit <= 1 || !dtToken) {
      return BigInt(0);
    }
    const accountInfo = await this.poolContract.getUserAccountData(account);
    const availableBase =
      (accountInfo.totalCollateralBase * accountInfo.ltv) /
        BigInt(10000) /
        BigInt(this.healthFactorLimit) -
      accountInfo.totalDebtBase;

    const price = await this.oracle.getAssetPrice(dtToken.underlyingAddress);
    // dept token and underlying token have the same decimals
    return (availableBase * new Any(1, dtToken.decimals).Number) / price;
  }

  // batch query debt tokens
  // the balanceOf(debtToken) > 0 and balanceOf(underlyingToken) > 0
  // repay amount = min(balanceOf(debtToken), balanceOf(underlyingToken))
  async checkDeptToRepay(account: string): Promise<WaitingRepayInfo[]> {
    const tokens: string[] = this.debtTokens
      .map((token) => [token.address, token.underlyingAddress])
      .flat();
    // [dept, underlying, dept, underlying, ...]
    const balances: bigint[] = await this.multicall.getBalance(account, tokens);
    let result: WaitingRepayInfo[] = [];
    for (let i = 0; i < balances.length; i += 2) {
      const deptBalance = balances[i];
      const underlyingBalance = balances[i + 1];
      const deptToken = this.debtTokens[(i / 2) | 0];
      if (underlyingBalance < deptToken.minReserved) {
        continue;
      }
      const avaiableRepayAmount = underlyingBalance - deptToken.minReserved;
      const repayBalance =
        deptBalance > avaiableRepayAmount ? avaiableRepayAmount : deptBalance;
      // donot satisfy min repay condition
      if (repayBalance < deptToken.minRepayAmount) {
        continue;
      }
      result.push({ token: deptToken, amount: repayBalance });
    }
    return result;
  }

  async batchRepayRawData(onBehalfOf: string): Promise<string[]> {
    const needToRepayDepts = await this.checkDeptToRepay(onBehalfOf);
    return needToRepayDepts.map((dept) =>
      this.poolContract.repayRawData(
        dept.token.underlyingAddress,
        dept.amount,
        onBehalfOf
      )
    );
  }

  borrowRawData(token: string, amount: bigint, onBehalfOf: string): string {
    let borrowToken = token;
    if (token === zeroAddress) {
        borrowToken = this.wrappedToken;
    }
    return this.poolContract.borrowRawData(borrowToken, amount, onBehalfOf);
  }

  address(): string {
    return this.poolContract.address;
  }
}
