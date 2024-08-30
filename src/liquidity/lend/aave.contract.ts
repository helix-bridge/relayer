import { Wallet, HDNodeWallet, ethers, Contract, InterfaceAbi } from "ethers";
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { aaveL2Pool } from "../../abi/aaveL2Pool";
import { aaveOracle } from "../../abi/aaveOracle";
import { GasPrice } from "../../base/provider";
import { EthereumContract } from "../../base/contract";

export const zeroAddress: string = "0x0000000000000000000000000000000000000000";
export const zeroTransferId: string =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export interface AccountData {
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  availableBorrowsBase: bigint;
  currentLiquidationThreshold: bigint;
  ltv: bigint;
  healthFactor: bigint;
}

const StableRate: number = 1;
const VariableRate: number = 2;

export class AaveOracle extends EthereumContract {
  constructor(
    address: string,
    signer: Wallet | HDNodeWallet | ethers.Provider
  ) {
    super(address, aaveOracle, signer);
  }

  // the decimals is 8
  async getAssetPrice(address: string): Promise<bigint> {
    return await this.contract.getAssetPrice(address);
  }
}

export class AaveL2Pool extends EthereumContract {
  constructor(
    address: string,
    signer: Wallet | HDNodeWallet | ethers.Provider
  ) {
    super(address, aaveL2Pool, signer);
  }

  // view
  async getUserAccountData(account: string): Promise<AccountData> {
    return await this.contract.getUserAccountData(account);
  }

  async borrow(
    token: string,
    amount: bigint,
    onBehalfOf: string,
    gas: GasPrice
  ): Promise<TransactionResponse> {
    return await this.call(
      "borrow",
      [token, amount, VariableRate, 0, onBehalfOf],
      gas,
      null,
      null,
      null
    );
  }

  async repay(
    token: string,
    amount: bigint,
    onBehalfOf: string,
    gas: GasPrice
  ): Promise<TransactionResponse> {
    return await this.call(
      "repay",
      [token, amount, VariableRate, onBehalfOf],
      gas,
      null,
      null,
      null
    );
  }

  async supply(
    token: string,
    amount: bigint,
    onBehalfOf: string,
    gas: GasPrice
  ): Promise<TransactionResponse> {
    return await this.call(
      "supply",
      [token, amount, onBehalfOf],
      gas,
      null,
      null,
      null
    );
  }

  async withdraw(
    token: string,
    amount: bigint,
    to: string,
    gas: GasPrice
  ): Promise<TransactionResponse> {
    return await this.call(
      "withdraw",
      [token, amount, to],
      gas,
      null,
      null,
      null
    );
  }

  // if native token, borrow weth, and withdraw it
  borrowRawData(token: string, amount: bigint, onBehalfOf: string): string {
    const data = this.interface.encodeFunctionData("borrow", [
      token,
      amount,
      VariableRate,
      0,
      onBehalfOf,
    ]);
    return data;
  }

  repayRawData(token: string, amount: bigint, onBehalfOf: string): string {
    const data = this.interface.encodeFunctionData("repay", [
      token,
      amount,
      VariableRate,
      onBehalfOf,
    ]);
    return data;
  }

  supplyRawData(token: string, amount: bigint, onBehalfOf: string): string {
    const data = this.interface.encodeFunctionData("supply", [
      token,
      amount,
      onBehalfOf,
      0,
    ]);
    return data;
  }

  withdrawRawData(token: string, amount: bigint, to: string): string {
    const data = this.interface.encodeFunctionData("withdraw", [
      token,
      amount,
      to,
    ]);
    return data;
  }
}
