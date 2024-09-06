import { Logger } from "@nestjs/common";
import { Wallet, HDNodeWallet, ethers, AbiCoder } from "ethers";
import {
  LendTokenInfo,
  CollateralInfo,
} from "../../configure/configure.service";
import {
  MoonwellOracle,
  MoonwellComptroller,
  MoonwellMToken,
} from "./moonwell.contract";
import {
  MulticallContract,
  zeroAddress,
  WETHContract,
  Erc20Contract,
  MulticallArgs,
} from "../../base/contract";
import {
  LendMarket,
  TxInfo,
  WithdrawBorrowBalance,
  DebtStatus,
  CollateralStatus,
  maxU256,
} from "./market";
import { Any } from "../../base/bignumber";
import { EthereumConnectedWallet } from "../../base/wallet";
import { EthereumProvider } from "../../base/provider";

export interface DebtToken {
  decimals: number;
  underlyingDecimals: number;
  mtokenAddress: string;
  mtokenContract: MoonwellMToken;
  underlyingAddress: string;
  underlyTokenContract: Erc20Contract;
  minRepayAmount: bigint;
  minReserved: bigint;
}

export interface CollateralToken {
  symbol: string;
  decimals: number;
  underlyingDecimals: number;
  mtokenAddress: string;
  mtokenContract: MoonwellMToken;
  underlyingAddress: string;
  underlyTokenContract: Erc20Contract;
  autoSupplyAmount: bigint;
}

export interface MToken {
  underlyingAddress: string;
  mtokenContract: MoonwellMToken;
}

export interface Mtoken {
  symbol: string;
  mtoken: string;
  underlyingToken: string;
  decimals: number;
  underlyingDecimals: number;
  isNativeWrapped: boolean;
}

export interface WaitingSupplyInfo {
  token: CollateralToken;
  amount: bigint;
}

export interface WaitingRepayInfo {
  token: DebtToken;
  amount: bigint;
}

export interface ChainInfo {
  name: string;
  comptroller: string;
  oracle: string;
  multicall: string;
  MTokens: Mtoken[];
}

export interface AddressBook {
  version: string;
  chains: ChainInfo[];
}

export interface MTokenDetail {
  address: string;
  collateralOriginToken: number;
  collateralBaseWithFactor: number;
  collateralFactorMantissa: number;
  borrow: number;
  price: number;
}

export interface LendInfo {
  totalCollateralWithFactor: number;
  totalBorrow: number;
  mtokenDetails: MTokenDetail[];
}

export class AddressBookConfigure {
  formalConfigure: AddressBook = {
    version: "v1",
    chains: [
      {
        name: "moonbeam",
        oracle: "0xED301cd3EB27217BDB05C4E9B820a8A3c8B665f9",
        comptroller: "0x8E00D5e02E65A19337Cdba98bbA9F84d4186a180",
        multicall: "0xcA11bde05977b3631167028862bE2a173976CA11",
        MTokens: [
          {
            symbol: "xcUSDT",
            mtoken: "0x42A96C0681B74838eC525AdbD13c37f66388f289",
            underlyingToken: "0xFFFFFFfFea09FB06d082fd1275CD48b191cbCD1d",
            decimals: 8,
            underlyingDecimals: 6,
            isNativeWrapped: false,
          },
          {
            symbol: "USDC.wh",
            mtoken: "0x744b1756e7651c6D57f5311767EAFE5E931D615b",
            underlyingToken: "0x931715FEE2d06333043d11F658C8CE934aC61D0c",
            decimals: 8,
            underlyingDecimals: 6,
            isNativeWrapped: false,
          },
          {
            symbol: "xcUSDC",
            mtoken: "0x22b1a40e3178fe7C7109eFCc247C5bB2B34ABe32",
            underlyingToken: "0xFFfffffF7D2B0B761Af01Ca8e25242976ac0aD7D",
            decimals: 8,
            underlyingDecimals: 6,
            isNativeWrapped: false,
          },
          {
            symbol: "GLMR",
            mtoken: "0x091608f4e4a15335145be0A279483C0f8E4c7955",
            underlyingToken: "0x0000000000000000000000000000000000000000",
            decimals: 8,
            underlyingDecimals: 18,
            isNativeWrapped: true,
          },
        ],
      },
    ],
  };
  testConfigure: AddressBook = {
    version: "v1.0",
    chains: [],
  };

  public addressBook(isTest: boolean): AddressBook {
    return isTest ? this.testConfigure : this.formalConfigure;
  }
}

export class Moonwell extends LendMarket {
  private readonly logger = new Logger("moonwell");
  public healthFactorLimit: number = 0.4;
  public comptrollerContract: MoonwellComptroller;
  public oracleContract: MoonwellOracle;
  public multicallContract: MulticallContract;
  public wethContract: WETHContract;
  public debtStatus = new Map();
  public collateralStatus = new Map();

  public debtTokens: DebtToken[];
  public collateralTokens: CollateralToken[];
  public mtokens: MToken[] = [];

  constructor(
    chainName: string,
    isTest: boolean,
    healthFactorLimit: number,
    collaterals: CollateralInfo[],
    tokens: LendTokenInfo[],
    signer: EthereumConnectedWallet | EthereumProvider
  ) {
    const addressBook = new AddressBookConfigure().addressBook(isTest);
    const bookInfo = addressBook.chains.find((e) => e.name == chainName);
    if (!bookInfo) {
      throw new Error(`[Lend]Chain ${chainName} Not Support`);
    }
    super(`moonwell-${chainName}`, undefined);

    // percent of asset can be borrowed total
    this.healthFactorLimit = healthFactorLimit;

    this.comptrollerContract = new MoonwellComptroller(
      bookInfo.comptroller,
      signer
    );
    this.oracleContract = new MoonwellOracle(bookInfo.oracle, signer);
    this.multicallContract = new MulticallContract(bookInfo.multicall, signer);

    // refresh status from chain when start
    if (!tokens) {
      throw new Error(`[Lend] Chain ${chainName} tokens empty`);
    }
    this.debtTokens = tokens.map((token) => {
      const tokenInfo = bookInfo.MTokens.find(
        (mtoken) => mtoken.symbol == token.symbol
      );
      if (tokenInfo === undefined) {
        throw new Error(
          `[Lend] DebtToken not exist symbol ${token.symbol}, chain ${chainName}`
        );
      }
      return {
        decimals: tokenInfo.decimals,
        underlyingDecimals: tokenInfo.underlyingDecimals,
        mtokenAddress: tokenInfo.mtoken,
        mtokenContract: new MoonwellMToken(tokenInfo.mtoken, signer),
        underlyingAddress: tokenInfo.underlyingToken,
        underlyTokenContract: new Erc20Contract(
          tokenInfo.underlyingToken,
          signer
        ),
        minRepayAmount:
          (BigInt((token.minRepay * 10000).toFixed()) *
            new Any(1, tokenInfo.underlyingDecimals).Number) /
          BigInt(10000),
        minReserved: BigInt(0),
      };
    });
    this.mtokens.push(
      ...this.debtTokens.map((token) => {
        return {
          underlyingAddress: token.underlyingAddress,
          mtokenContract: token.mtokenContract,
        };
      })
    );
    this.collateralTokens = collaterals.map((token) => {
      const tokenInfo = bookInfo.MTokens.find(
        (mtoken) => mtoken.symbol == token.symbol
      );
      if (tokenInfo === undefined) {
        throw new Error(
          `[Lend] CollateralTokens not exist symbol ${token.symbol}, chain ${chainName}`
        );
      }
      return {
        symbol: token.symbol,
        decimals: tokenInfo.decimals,
        underlyingDecimals: tokenInfo.underlyingDecimals,
        mtokenAddress: tokenInfo.mtoken,
        mtokenContract: new MoonwellMToken(tokenInfo.mtoken, signer),
        underlyingAddress: tokenInfo.underlyingToken,
        underlyTokenContract: new Erc20Contract(
          tokenInfo.underlyingToken,
          signer
        ),
        autoSupplyAmount: new Any(
          token.autosupplyAmount ?? 0,
          tokenInfo.underlyingDecimals
        ).Number,
      };
    });
    this.mtokens.push(
      ...this.collateralTokens.map((token) => {
        return {
          underlyingAddress: token.underlyingAddress,
          mtokenContract: token.mtokenContract,
        };
      })
    );
  }

  public enableDebtStatus(account: string) {
    this.debtStatus.set(account, DebtStatus.HasDebt);
  }

  public enableCollateralLack(account: string) {
    this.collateralStatus.set(account, CollateralStatus.CollateralLack);
  }

  async userLendInfo(account: string): Promise<LendInfo | null> {
    const allMtokens = await this.comptrollerContract.getAssetsIn(account);
    let args: MulticallArgs[] = [];
    let mtokenDetails: MTokenDetail[] = [];
    for (const mToken of allMtokens) {
      const getUnderlyingPriceData =
        this.oracleContract.getUnderlyingPriceRawData(mToken);
      const mtoken = this.mtokens.find(
        (mt) => mt.mtokenContract.address.toLowerCase() === mToken.toLowerCase()
      );
      if (!mtoken) continue;

      const mtokenData =
        mtoken.mtokenContract.getAccountSnapshotRawData(account);
      const collateralFactorData =
        await this.comptrollerContract.marketsRawData(
          mtoken.mtokenContract.address
        );
      args.push({
        address: mtoken.mtokenContract.address,
        data: mtokenData,
      });
      args.push({
        address: this.comptrollerContract.address,
        data: collateralFactorData,
      });
      args.push({
        address: this.oracleContract.address,
        data: getUnderlyingPriceData,
      });
      mtokenDetails.push({
        address: mToken.toLowerCase(),
        collateralOriginToken: 0,
        collateralBaseWithFactor: 0,
        collateralFactorMantissa: 0,
        borrow: 0,
        price: 1,
      });
    }
    const response = await this.multicallContract.aggregate(args);
    const results = response[1];
    if (results.length % 3 != 0) {
      return null;
    }
    let totalCollateralWithFactor = 0;
    let totalBorrow = 0;
    for (let index = 0; index < results.length; index += 3) {
      const mtokenInfo = results[index];
      const marketInfo = results[index + 1];
      const oraclePriceInfo = results[index + 2];
      const [err, mTokenBalance, borrowBalance, exchangeRateMantissa] =
        AbiCoder.defaultAbiCoder().decode(
          ["uint", "uint", "uint", "uint"],
          mtokenInfo
        );
      const [isListed, collateralFactorMantissa] =
        AbiCoder.defaultAbiCoder().decode(["bool", "uint"], marketInfo);
      const [underlingPrice] = AbiCoder.defaultAbiCoder().decode(
        ["uint"],
        oraclePriceInfo
      );
      if (err != 0 || !isListed) {
        continue;
      }
      mtokenDetails[index / 3].collateralOriginToken =
        (Number(mTokenBalance) * Number(exchangeRateMantissa)) / 1e18;
      mtokenDetails[index / 3].collateralBaseWithFactor =
        (((mtokenDetails[index / 3].collateralOriginToken *
          Number(collateralFactorMantissa)) /
          1e18) *
          Number(underlingPrice)) /
        1e18;
      mtokenDetails[index / 3].collateralFactorMantissa =
        Number(collateralFactorMantissa) / 1e18;
      mtokenDetails[index / 3].borrow =
        (Number(borrowBalance) * Number(underlingPrice)) / 1e18;
      mtokenDetails[index / 3].price = Number(underlingPrice) / 1e18;
      totalCollateralWithFactor +=
        mtokenDetails[index / 3].collateralBaseWithFactor;
      totalBorrow += mtokenDetails[index / 3].borrow;
    }
    return {
      totalCollateralWithFactor,
      totalBorrow,
      mtokenDetails,
    };
  }

  async borrowAvailable(account: string, asset: string): Promise<bigint> {
    const dtToken = this.debtTokens.find(
      (dt) => dt.underlyingAddress.toLowerCase() == asset.toLowerCase()
    );
    // not support this token
    // suggest value is 0.5
    if (this.healthFactorLimit >= 0.8 || !dtToken) {
      return BigInt(0);
    }
    const lendInfo = await this.userLendInfo(account);
    if (!lendInfo) {
      return BigInt(0);
    }
    const { totalCollateralWithFactor, totalBorrow, mtokenDetails } = lendInfo;
    let avaiableBase =
      totalCollateralWithFactor * this.healthFactorLimit - totalBorrow;
    const dtTokenUnderlyingPrice = await this.oracleContract.getUnderlyingPrice(
      dtToken.mtokenAddress
    );
    return BigInt(
      Math.floor(avaiableBase / (Number(dtTokenUnderlyingPrice) / 1e18))
    );
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
    const mtoken = this.mtokens.find(
      (mt) => mt.underlyingAddress.toLowerCase() === token.toLowerCase()
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
      const withdrawBalance =
        fixedWithdrawBalance > amount ? amount : fixedWithdrawBalance;
      const withdrawCollateral =
        fixedWithdrawBalance > amount ? amount : maxU256;
      txs.push({
        to: mtoken.mtokenContract.address,
        value: "0",
        data: this.withdrawRawData(token, withdrawCollateral, onBehalfOf),
      });
      if (withdrawBalance !== amount) {
        if (withdrawAvailable.borrow >= amount - withdrawBalance) {
          txs.push({
            to: mtoken.mtokenContract.address,
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
          to: mtoken.mtokenContract.address,
          value: "0",
          data: this.borrowRawData(token, amount, onBehalfOf),
        });
        this.enableDebtStatus(onBehalfOf);
      }
    } else {
      this.logger.warn(`[${this.name}] not enough balance, need ${amount}`);
    }
    return txs;
  }

  async withdrawAndBorrowAvailable(
    account: string,
    asset: string
  ): Promise<WithdrawBorrowBalance> {
    const collateralToken = this.collateralTokens.find(
      (ct) => ct.underlyingAddress.toLowerCase() == asset.toLowerCase()
    );
    if (this.healthFactorLimit >= 0.8 || !collateralToken) {
      return { withdraw: BigInt(0), borrow: BigInt(0) };
    }

    const { totalCollateralWithFactor, totalBorrow, mtokenDetails } =
      await this.userLendInfo(account);
    const tokenDetail = mtokenDetails.find(
      (mt) =>
        mt.address.toLowerCase() === collateralToken.mtokenAddress.toLowerCase()
    );
    if (!tokenDetail) {
      return { withdraw: BigInt(0), borrow: BigInt(0) };
    }
    // (totalCollateralWithFactor - x) * healthFactorLimit - totalBorrow > 0
    if (totalCollateralWithFactor * this.healthFactorLimit <= totalBorrow) {
      return { withdraw: BigInt(0), borrow: BigInt(0) };
    }
    // if withdraw amount x from tokenDetail，then it's collateral update to `tokenDetail.collateralOriginToken - x`
    // satisfy: totalBorrow/(totalCollateralWithFactor - x * collateralFactorMantissa) < this.healthFactorLimit
    // x < (totalCollateralWithFactor - this.totalBorrow / this.healthFactorLimit) / collateralFactorMantissa
    let maxWithdrawableBaseWithFactor =
      totalCollateralWithFactor - totalBorrow / this.healthFactorLimit;
    if (maxWithdrawableBaseWithFactor < tokenDetail.collateralBaseWithFactor) {
      let maxWithdrawableBase =
        maxWithdrawableBaseWithFactor / tokenDetail.collateralFactorMantissa;
      return {
        withdraw: BigInt(Math.floor(maxWithdrawableBase / tokenDetail.price)),
        borrow: BigInt(0),
      };
    } else {
      maxWithdrawableBaseWithFactor -= tokenDetail.collateralBaseWithFactor;
      let maxWithdrawableBase =
        tokenDetail.collateralBaseWithFactor /
        tokenDetail.collateralFactorMantissa;
      return {
        withdraw: BigInt(Math.floor(maxWithdrawableBase / tokenDetail.price)),
        borrow: BigInt(
          Math.floor(maxWithdrawableBaseWithFactor / tokenDetail.price)
        ),
      };
    }
  }

  async checkCollateralToSupply(account: string): Promise<WaitingSupplyInfo[]> {
    if (
      this.collateralStatus.get(account) === CollateralStatus.CollateralFull
    ) {
      return [];
    }
    const tokens: string[] = this.collateralTokens.map(
      (token) => token.underlyingAddress
    );
    // [aToken, underlying, aToken, underlying, ...]
    const balances: bigint[] = await this.multicallContract.getBalance(
      account,
      tokens
    );
    let result: WaitingSupplyInfo[] = [];
    let collateralStatus: CollateralStatus = CollateralStatus.CollateralFull;

    const collateralSnapshotData = this.collateralTokens.map((token) => {
      return {
        address: token.mtokenContract.address,
        data: token.mtokenContract.getAccountSnapshotRawData(account),
      };
    });
    const response = await this.multicallContract.aggregate(
      collateralSnapshotData
    );
    const results = response[1];
    if (results.length !== collateralSnapshotData.length) {
      return [];
    }

    for (let i = 0; i < balances.length; i++) {
      //const mTokenBalance = balances[i];
      const collateralToken = this.collateralTokens[i];
      const mtokenInfo = results[i];
      const [err, mTokenBalance, borrowBalance, exchangeRateMantissa] =
        AbiCoder.defaultAbiCoder().decode(
          ["uint", "uint", "uint", "uint"],
          mtokenInfo
        );
      const undelyingBalanceInCollateral =
        (Number(mTokenBalance) * Number(exchangeRateMantissa)) / 1e18;
      if (undelyingBalanceInCollateral >= collateralToken.autoSupplyAmount) {
        continue;
      } else {
        collateralStatus = CollateralStatus.CollateralLack;
      }
      const underlyingBalance = balances[i];
      const maxInterest =
        (BigInt(Math.floor(undelyingBalanceInCollateral)) * BigInt(20)) /
        BigInt(100 * 365); // 20 APY 1 day
      const ignoreSize = maxInterest.toString().length;
      const fixedUndelyingBalanceInCollateral =
        (BigInt(Math.floor(undelyingBalanceInCollateral)) /
          BigInt(10 ** ignoreSize)) *
        BigInt(10 ** ignoreSize);
      const needSupplyBalance =
        collateralToken.autoSupplyAmount - fixedUndelyingBalanceInCollateral;

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
        const isNativeToken =
          collateral.token.underlyingAddress === zeroAddress;

        // approve erc20 first
        if (!isNativeToken) {
          txs.push({
            to: collateral.token.underlyingAddress,
            value: "0",
            data: collateral.token.underlyTokenContract.approveRawData(
              collateral.token.mtokenAddress,
              collateral.amount
            ),
          });
        }
        const enterMarkets = this.comptrollerContract.enterMarketsRawData(
          collateral.token.mtokenAddress
        );
        txs.push({
          to: this.comptrollerContract.address,
          value: "0",
          data: enterMarkets,
        });
        const supplyData = collateral.token.mtokenContract.supplyRawData(
          isNativeToken,
          collateral.amount
        );
        txs.push({
          to: collateral.token.mtokenAddress,
          value: isNativeToken ? collateral.amount : "0",
          data: supplyData,
        });
        return txs;
      })
      .flat();
  }

  async checkDebtToRepay(account: string): Promise<WaitingRepayInfo[]> {
    if (this.debtStatus.get(account) === DebtStatus.NoDebt) {
      return [];
    }
    const tokens: string[] = this.debtTokens.map(
      (token) => token.underlyingAddress
    );
    // [debt, underlying, debt, underlying, ...]
    const balances: bigint[] = await this.multicallContract.getBalance(
      account,
      tokens
    );
    let result: WaitingRepayInfo[] = [];
    let debtStatus: DebtStatus = DebtStatus.NoDebt;

    const collateralSnapshotData = this.debtTokens.map((token) => {
      return {
        address: token.mtokenContract.address,
        data: token.mtokenContract.getAccountSnapshotRawData(account),
      };
    });
    const response = await this.multicallContract.aggregate(
      collateralSnapshotData
    );
    const results = response[1];
    if (results.length !== collateralSnapshotData.length) {
      return [];
    }
    for (let i = 0; i < balances.length; i++) {
      const debtToken = this.debtTokens[i];
      const mtokenInfo = results[i];
      const [err, mTokenBalance, borrowBalance, exchangeRateMantissa] =
        AbiCoder.defaultAbiCoder().decode(
          ["uint", "uint", "uint", "uint"],
          mtokenInfo
        );
      if (borrowBalance > BigInt(0)) {
        debtStatus = DebtStatus.HasDebt;
      } else {
        continue;
      }
      const underlyingBalance = balances[i];
      if (underlyingBalance < debtToken.minReserved) {
        continue;
      }
      const avaiableRepayAmount = underlyingBalance - debtToken.minReserved;
      // repay only when enough avaiable balance
      // The signers cannot ensure that they see the same balances, but they can ensure that they see the same borrowing amounts.
      // we need to fix the borrowBalance to generate unique tx, the balance is a little bigger than real balance
      const maxInterest = (borrowBalance * BigInt(20)) / BigInt(100 * 365); // 20 APY 1 day
      const ignoreSize = maxInterest.toString().length;
      const fixedDebtBalance =
        (borrowBalance / BigInt(10 ** ignoreSize) + BigInt(1)) *
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

  async batchRepayRawData(onBehalfOf: string): Promise<TxInfo[]> {
    const needToRepayDebts = await this.checkDebtToRepay(onBehalfOf);
    // 1. if native token, deposit with value
    // 2. approve mtokenContract the underlying token
    // 3. repay
    return needToRepayDebts
      .map((debt) => {
        let txs = [];
        const isNativeToken = debt.token.underlyingAddress === zeroAddress;
        if (!isNativeToken) {
          txs.push({
            to: debt.token.underlyingAddress,
            value: "0",
            data: debt.token.underlyTokenContract.approveRawData(
              debt.token.mtokenAddress,
              debt.amount
            ),
          });
        }
        const repayData = debt.token.mtokenContract.repayBorrowRawData(
          isNativeToken,
          debt.amount
        );
        txs.push({
          to: debt.token.mtokenAddress,
          value: isNativeToken ? debt.amount : "0",
          data: repayData,
        });
        return txs;
      })
      .flat();
  }

  borrowRawData(token: string, amount: bigint, onBehalfOf: string): string {
    const mtoken = this.mtokens.find(
      (mt) => mt.underlyingAddress.toLowerCase() === token.toLowerCase()
    );
    return mtoken.mtokenContract.borrowRawData(amount);
  }

  withdrawRawData(token: string, amount: bigint, onBehalfOf: string): string {
    const mtoken = this.mtokens.find(
      (mt) => mt.underlyingAddress.toLowerCase() === token.toLowerCase()
    );
    return mtoken.mtokenContract.withdrawUnderlyingRawData(amount);
  }
}
