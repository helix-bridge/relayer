import { Logger } from "@nestjs/common";
import { Wallet, HDNodeWallet, ethers } from "ethers";
import { AaveOracle, AaveL2Pool } from "./contract";
import {
  MulticallContract,
  zeroAddress,
  WETHContract,
  Erc20Contract,
} from "../../base/contract";
import { LendMarket, TxInfo, WithdrawBorrowBalance } from "./market";
import {
  LendTokenInfo,
  CollateralInfo,
} from "../../configure/configure.service";
import { Any } from "../../base/bignumber";

export interface DebtToken {
  address: string;
  decimals: number;
  underlyingAddress: string;
  underlyTokenContract: Erc20Contract;
  aTokenContract: Erc20Contract;
  // the min repay amount each time
  minRepayAmount: bigint;
  // the min reserved underlying balance
  minReserved: bigint;
}

export interface CollateralToken {
  symbol: string;
  decimals: number;
  underlyingAddress: string;
  underlyTokenContract: Erc20Contract;
  aTokenContract: Erc20Contract;
  autosupplyAmount: bigint;
}

export interface WaitingRepayInfo {
  token: DebtToken;
  amount: bigint;
}

export interface WaitingSupplyInfo {
  token: CollateralToken;
  amount: bigint;
}

export interface DebtTokenBook {
  symbol: string;
  decimals: number;
  aToken: string;
  vToken: string;
  underlyingToken: string;
  isNativeWrapped: boolean;
}

export interface ChainInfo {
  name: string;
  l2Pool: string;
  oracle: string;
  multicall: string;
  debtTokens: DebtTokenBook[];
}

export interface AddressBook {
  version: string;
  chains: ChainInfo[];
}

export enum DebtStatus {
  HasDebt,
  NoDebt,
}

export enum CollateralStatus {
  CollateralFull,
  CollateralLack,
}

export const maxU256: bigint = BigInt(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
);

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
        debtTokens: [
          {
            symbol: "usdt",
            aToken: "0x6ab707Aca953eDAeFBc4fD23bA73294241490620",
            vToken: "0xfb00AC187a8Eb5AFAE4eACE434F493Eb62672df7",
            underlyingToken: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
            decimals: 6,
            isNativeWrapped: false,
          },
          {
            symbol: "weth",
            aToken: "0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8",
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
        debtTokens: [
          {
            symbol: "weth",
            aToken: "0x96e32dE4B1d1617B8c2AE13a88B9cC287239b13f",
            vToken: "0xf0F0025Dc51f532Ab84c33Eb9d01583EAa0F74c7",
            underlyingToken: "0x4200000000000000000000000000000000000006",
            decimals: 18,
            isNativeWrapped: true,
          },
        ],
      },
    ],
  };

  public addressBook(isTest: boolean): AddressBook {
    return isTest ? this.testConfigure : this.formalConfigure;
  }
}

export class Aave extends LendMarket {
  private readonly logger = new Logger("aave");
  public healthFactorLimit: number;
  public poolContract: AaveL2Pool;
  public oracle: AaveOracle;
  public multicall: MulticallContract;
  public wethContract: WETHContract;
  public debtStatus = new Map();
  public collateralStatus = new Map();

  public debtTokens: DebtToken[];
  public collateralTokens: CollateralToken[];

  constructor(
    chainName: string,
    isTest: boolean,
    healthFactorLimit: number,
    collaterals: CollateralInfo[],
    tokens: LendTokenInfo[],
    signer: Wallet | HDNodeWallet | ethers.Provider
  ) {
    const addressBook = new AddressBookConfigure().addressBook(isTest);
    const bookInfo = addressBook.chains.find((e) => e.name == chainName);
    if (!bookInfo) {
      throw new Error(`[Lend]Chain ${chainName} Not Support`);
    }
    const wtoken = bookInfo.debtTokens.find((dt) => dt.isNativeWrapped);
    super(`aave-${chainName}`, wtoken?.underlyingToken);

    this.healthFactorLimit = healthFactorLimit;
    this.poolContract = new AaveL2Pool(bookInfo.l2Pool, signer);
    this.oracle = new AaveOracle(bookInfo.oracle, signer);
    this.multicall = new MulticallContract(bookInfo.multicall, signer);
    if (wtoken !== undefined) {
      this.wethContract = new WETHContract(wtoken?.underlyingToken, signer);
    }
    // refresh status from chain when start
    if (!tokens) {
      throw new Error(`[Lend]Chain ${chainName} tokens empty`);
    }
    this.debtTokens = tokens.map((token) => {
      const tokenInfo = bookInfo.debtTokens.find(
        (dt) => dt.symbol == token.symbol
      );
      //const collateralInfo = collaterals.find((c) => c.symbol === token.symbol);
      return {
        address: tokenInfo.vToken,
        underlyingAddress: tokenInfo.underlyingToken,
        underlyTokenContract: new Erc20Contract(
          tokenInfo.underlyingToken,
          signer
        ),
        aTokenContract: new Erc20Contract(tokenInfo.aToken, signer),
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
    this.collateralTokens = collaterals.map((token) => {
      const tokenInfo = bookInfo.debtTokens.find(
        (dt) => dt.symbol == token.symbol
      );
      return {
        symbol: token.symbol,
        decimals: tokenInfo.decimals,
        underlyingAddress: tokenInfo.underlyingToken,
        underlyTokenContract: new Erc20Contract(
          tokenInfo.underlyingToken,
          signer
        ),
        aTokenContract: new Erc20Contract(tokenInfo.aToken, signer),
        autosupplyAmount: new Any(
          token.autosupplyAmount ?? 0,
          tokenInfo.decimals
        ).Number,
      };
    });
  }

  public enableDebtStatus(account: string) {
    this.debtStatus.set(account, DebtStatus.HasDebt);
  }

  public enableCollateralLack(account: string) {
    this.collateralStatus.set(account, CollateralStatus.CollateralLack);
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

    if (availableBase <= BigInt(0)) {
      return BigInt(0);
    }

    const price = await this.oracle.getAssetPrice(dtToken.underlyingAddress);
    // debt token and underlying token have the same decimals
    return (availableBase * new Any(1, dtToken.decimals).Number) / price;
  }

  async withdrawAndBorrowAvailable(
    account: string,
    asset: string
  ): Promise<WithdrawBorrowBalance> {
    if (asset == zeroAddress && !this.wrappedToken) {
      return { withdraw: BigInt(0), borrow: BigInt(0) };
    }
    const collateralToken = this.collateralTokens.find(
      (ct) =>
        ct.underlyingAddress == asset ||
        (asset == zeroAddress && ct.underlyingAddress == this.wrappedToken)
    );
    if (this.healthFactorLimit <= 1 || !collateralToken) {
      return { withdraw: BigInt(0), borrow: BigInt(0) };
    }
    const accountInfo = await this.poolContract.getUserAccountData(account);
    // (totalCollateralBase - x) * ltv / BigInt(10000) / BigInt(this.healthFactorLimit) >= totalDebtBase
    // x <= totalCollateralBase - totalDebtBase * BigInt(this.healthFactorLimit) * BigInt(10000) / ltv
    const availableBase =
      accountInfo.totalCollateralBase -
      (accountInfo.totalDebtBase *
        BigInt(this.healthFactorLimit) *
        BigInt(10000)) /
        accountInfo.ltv;
    if (availableBase <= BigInt(0)) {
      return { withdraw: BigInt(0), borrow: BigInt(0) };
    }
    const price = await this.oracle.getAssetPrice(
      collateralToken.underlyingAddress
    );
    // get aToken
    const availableAToken =
      (availableBase * new Any(1, collateralToken.decimals).Number) / price;
    const aTokenBalance = await collateralToken.aTokenContract.balanceOf(
      account
    );
    if (aTokenBalance === BigInt(0)) {
      return { withdraw: BigInt(0), borrow: BigInt(0) };
    }
    if (aTokenBalance > availableAToken) {
      return { withdraw: availableAToken, borrow: BigInt(0) };
    } else {
      const debtToken = this.debtTokens.find(
        (dt) =>
          dt.underlyingAddress == asset ||
          (asset == zeroAddress && dt.underlyingAddress == this.wrappedToken)
      );
      if (!debtToken) {
        return { withdraw: availableAToken, borrow: BigInt(0) };
      }
      // withdraw aTokenBalance, others borrow
      // (totalCollateralBase - aTokenBase) * ltv / BigInt(10000) / BigInt(this.healthFactorLimit) >= totalDebtBase + xBase
      // xBase <= (totalCollateralBase - aTokenBase) * ltv / BigInt(10000) / BigInt(this.healthFactorLimit) - totalDebtBase

      // aTokenBalance => aTokenBase
      const aTokenBase =
        (aTokenBalance * price) / new Any(1, debtToken.decimals).Number;
      // because aTokenBalance < availableAToken, then availableBorrowBase > 0
      const availableBorrowBase =
        ((accountInfo.totalCollateralBase - aTokenBase) * accountInfo.ltv) /
          BigInt(10000) /
          BigInt(this.healthFactorLimit) -
        accountInfo.totalDebtBase;
      return {
        withdraw: aTokenBalance,
        borrow:
          (availableBorrowBase * new Any(1, debtToken.decimals).Number) / price,
      };
    }
  }

  // batch query debt tokens
  // the balanceOf(debtToken) > 0 and balanceOf(underlyingToken) > 0
  // repay amount = min(balanceOf(debtToken), balanceOf(underlyingToken))
  async checkDebtToRepay(account: string): Promise<WaitingRepayInfo[]> {
    if (this.debtStatus.get(account) === DebtStatus.NoDebt) {
      return [];
    }
    const tokens: string[] = this.debtTokens
      .map((token) => [
        token.address,
        token.underlyingAddress === this.wrappedToken
          ? zeroAddress
          : token.underlyingAddress,
      ])
      .flat();
    // [debt, underlying, debt, underlying, ...]
    const balances: bigint[] = await this.multicall.getBalance(account, tokens);
    let result: WaitingRepayInfo[] = [];
    let debtStatus: DebtStatus = DebtStatus.NoDebt;
    for (let i = 0; i < balances.length; i += 2) {
      const debtBalance = balances[i];
      if (debtBalance > BigInt(0)) {
        debtStatus = DebtStatus.HasDebt;
      } else {
        continue;
      }
      const underlyingBalance = balances[i + 1];
      const debtToken = this.debtTokens[(i / 2) | 0];
      if (underlyingBalance < debtToken.minReserved) {
        continue;
      }
      const avaiableRepayAmount = underlyingBalance - debtToken.minReserved;
      // repay only when enough avaiable balance
      // The signers cannot ensure that they see the same balances, but they can ensure that they see the same borrowing amounts.
      // we need to fix the debtBalance to generate unique tx, the balance is a little bigger than real balance
      const maxInterest = (debtBalance * BigInt(20)) / BigInt(100 * 365); // 20 APY 1 day
      const ignoreSize = maxInterest.toString().length;
      const fixedDebtBalance =
        (debtBalance / BigInt(10 ** ignoreSize) + BigInt(1)) *
        BigInt(10 ** ignoreSize);
      if (fixedDebtBalance > avaiableRepayAmount) {
        continue;
      }
      // donot satisfy min repay condition
      if (fixedDebtBalance < debtToken.minRepayAmount) {
        continue;
      }
      result.push({ token: debtToken, amount: fixedDebtBalance });
    }
    this.debtStatus.set(account, debtStatus);
    return result;
  }

  async checkCollateralToSupply(account: string): Promise<WaitingSupplyInfo[]> {
    if (
      this.collateralStatus.get(account) === CollateralStatus.CollateralFull
    ) {
      return [];
    }
    const tokens: string[] = this.collateralTokens
      .map((token) => [
        token.aTokenContract.address,
        token.underlyingAddress === this.wrappedToken
          ? zeroAddress
          : token.underlyingAddress,
      ])
      .flat();
    // [aToken, underlying, aToken, underlying, ...]
    const balances: bigint[] = await this.multicall.getBalance(account, tokens);
    let result: WaitingSupplyInfo[] = [];
    let collateralStatus: CollateralStatus = CollateralStatus.CollateralFull;
    for (let i = 0; i < balances.length; i += 2) {
      const aTokenBalance = balances[i];
      const collateralToken = this.collateralTokens[(i / 2) | 0];
      if (aTokenBalance >= collateralToken.autosupplyAmount) {
        continue;
      } else {
        collateralStatus = CollateralStatus.CollateralLack;
      }
      const underlyingBalance = balances[i + 1];
      const maxInterest = (aTokenBalance * BigInt(20)) / BigInt(100 * 365); // 20 APY 1 day
      const ignoreSize = maxInterest.toString().length;
      const fixedATokenBalance =
        (aTokenBalance / BigInt(10 ** ignoreSize)) * BigInt(10 ** ignoreSize);
      const needSupplyBalance =
        collateralToken.autosupplyAmount - fixedATokenBalance;

      const avaiableSupplyAmount =
        underlyingBalance > needSupplyBalance
          ? needSupplyBalance
          : underlyingBalance;
      if (avaiableSupplyAmount <= 0) {
        continue;
      }
      result.push({ token: collateralToken, amount: avaiableSupplyAmount });
    }
    this.collateralStatus.set(account, collateralStatus);
    return result;
  }

  async batchRepayRawData(onBehalfOf: string): Promise<TxInfo[]> {
    const needToRepayDebts = await this.checkDebtToRepay(onBehalfOf);
    // 1. if native token, deposit for weth
    // 2. approve L2Pool the underlying token
    // 3. repay
    return needToRepayDebts
      .map((debt) => {
        let txs = [];
        if (debt.token.underlyingAddress === this.wrappedToken) {
          txs.push({
            to: this.wrappedToken,
            value: debt.amount.toString(),
            data: this.wethContract.depositRawData(),
          });
        }
        txs.push({
          to: debt.token.underlyingAddress,
          value: "0",
          data: debt.token.underlyTokenContract.approveRawData(
            this.poolContract.address,
            debt.amount
          ),
        });
        const repayData = this.poolContract.repayRawData(
          debt.token.underlyingAddress,
          debt.amount,
          onBehalfOf
        );
        txs.push({
          to: this.poolContract.address,
          value: "0",
          data: repayData,
        });
        return txs;
      })
      .flat();
  }

  async batchSupplyRawData(onBehalfOf: string): Promise<TxInfo[]> {
    const needToSupplyCollaterals = await this.checkCollateralToSupply(
      onBehalfOf
    );
    // 1. if native token, deposit for weth
    // 2. approve L2Pool the underlying token
    // 3. supply
    return needToSupplyCollaterals
      .map((collateral) => {
        let txs = [];
        if (collateral.token.underlyingAddress === this.wrappedToken) {
          txs.push({
            to: this.wrappedToken,
            value: collateral.amount.toString(),
            data: this.wethContract.depositRawData(),
          });
        }
        txs.push({
          to: collateral.token.underlyingAddress,
          value: "0",
          data: collateral.token.underlyTokenContract.approveRawData(
            this.poolContract.address,
            collateral.amount
          ),
        });
        const supplyData = this.poolContract.supplyRawData(
          collateral.token.underlyingAddress,
          collateral.amount,
          onBehalfOf
        );
        txs.push({
          to: this.poolContract.address,
          value: "0",
          data: supplyData,
        });
        return txs;
      })
      .flat();
  }

  borrowRawData(token: string, amount: bigint, onBehalfOf: string): string {
    let borrowToken = token;
    if (token === zeroAddress) {
      borrowToken = this.wrappedToken;
    }
    return this.poolContract.borrowRawData(borrowToken, amount, onBehalfOf);
  }

  withdrawRawData(token: string, amount: bigint, onBehalfOf: string): string {
    let withdrawToken = token;
    if (token === zeroAddress) {
      withdrawToken = this.wrappedToken;
    }
    return this.poolContract.withdrawRawData(withdrawToken, amount, onBehalfOf);
  }

  async lendingFromPoolTxs(
    token: string,
    amount: bigint,
    onBehalfOf: string
  ): Promise<TxInfo[]> {
    let txs: TxInfo[] = [];
    const withdrawAvailable = await this.withdrawAndBorrowAvailable(
      onBehalfOf,
      token
    );
    let avaiable = withdrawAvailable.withdraw + withdrawAvailable.borrow;
    if (avaiable >= amount) {
      const maxInterest =
        (withdrawAvailable.withdraw * BigInt(20)) / BigInt(100 * 365); // 20 APY 1 day
      const ignoreSize = maxInterest.toString().length;
      const fixedWithdrawBalance =
        (withdrawAvailable.withdraw / BigInt(10 ** ignoreSize)) *
        BigInt(10 ** ignoreSize);
      this.logger.log(
        `[${this.name}] withdraw from collateral to relay withdraw: ${withdrawAvailable.withdraw}, fixed: ${fixedWithdrawBalance}, borrow: ${withdrawAvailable.borrow}, need: ${amount}`
      );
      // if fixedWithdrawBalance === 0 and withdrawAvailable.withdraw > 0
      // then withdraw all and borrow(enough) to relay

      const withdrawBalance =
        fixedWithdrawBalance > amount ? amount : fixedWithdrawBalance;
      const withdrawCollateral =
        fixedWithdrawBalance > amount ? amount : maxU256;
      txs.push({
        to: this.poolContract.address,
        value: "0",
        data: this.withdrawRawData(token, withdrawCollateral, onBehalfOf),
      });
      if (withdrawBalance !== amount) {
        if (withdrawAvailable.borrow >= amount - withdrawBalance) {
          txs.push({
            to: this.poolContract.address,
            value: "0",
            data: this.borrowRawData(
              token,
              amount - withdrawBalance,
              onBehalfOf
            ),
          });
          this.enableDebtStatus(onBehalfOf);
        } else {
          this.logger.warn(
            `[${this.name}] withdraw fixed amount not enough fixed: ${fixedWithdrawBalance}, amount: ${amount}`
          );
          return [];
        }
      }
      this.enableCollateralLack(onBehalfOf);
    } else if (avaiable === BigInt(0)) {
      avaiable = await this.borrowAvailable(onBehalfOf, token);
      this.logger.log(
        `[${this.name}] borrow from collateral to relay avaiable: ${avaiable}, need: ${amount}`
      );
      if (avaiable >= amount) {
        // borrow and relay
        // if native token, borrow wtoken and withdraw then relay
        // 1. borrow
        txs.push({
          to: this.poolContract.address,
          value: "0",
          data: this.borrowRawData(token, amount, onBehalfOf),
        });
        this.enableDebtStatus(onBehalfOf);
      }
    } else {
      this.logger.warn(`[${this.name}] not enough balance, need ${amount}`);
    }
    if (avaiable >= amount) {
      // withdraw if native token
      if (token === zeroAddress) {
        txs.push({
          to: this.wrappedToken,
          value: "0",
          data: this.wethContract.withdrawRawData(amount),
        });
      }
    }
    return txs;
  }

  address(): string {
    return this.poolContract.address;
  }
}
