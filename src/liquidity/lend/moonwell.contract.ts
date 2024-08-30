import { Wallet, HDNodeWallet, ethers, Contract, InterfaceAbi } from "ethers";
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { moonwellOracle } from "../../abi/moonwellOracle";
import { moonwellComptroller } from "../../abi/moonwellComptroller";
import { moonwellMToken } from "../../abi/moonwellMToken";
import { GasPrice } from "../../base/provider";
import { EthereumContract } from "../../base/contract";

export class MoonwellOracle extends EthereumContract {
  constructor(
    address: string,
    signer: Wallet | HDNodeWallet | ethers.Provider
  ) {
    super(address, moonwellOracle, signer);
  }

  async getUnderlyingPrice(address: string): Promise<bigint> {
    return await this.contract.getUnderlyingPrice(address);
  }

  getUnderlyingPriceRawData(address: string): string {
    return this.interface.encodeFunctionData("getUnderlyingPrice", [address]);
  }
}

export class MoonwellComptroller extends EthereumContract {
  constructor(
    address: string,
    signer: Wallet | HDNodeWallet | ethers.Provider
  ) {
    super(address, moonwellComptroller, signer);
  }

  async getAssetsIn(account: string): Promise<string[]> {
    return await this.contract.getAssetsIn(account);
  }

  async markets(account: string): Promise<string> {
    return await this.contract.markets(account);
  }

  marketsRawData(account: string): string {
    return this.interface.encodeFunctionData("markets", [account]);
  }

  enterMarketsRawData(mtoken: string): string {
    return this.interface.encodeFunctionData("enterMarkets", [[mtoken]]);
  }
}

export class MoonwellMToken extends EthereumContract {
  constructor(
    address: string,
    signer: Wallet | HDNodeWallet | ethers.Provider
  ) {
    super(address, moonwellMToken, signer);
  }

  async getAccountSnapshot(account: string): Promise<bigint[]> {
    return await this.contract.getAccountSnapshot(account);
  }

  getAccountSnapshotRawData(account: string): string {
    return this.interface.encodeFunctionData("getAccountSnapshot", [account]);
  }

  withdrawUnderlyingRawData(amount: bigint): string {
    return this.interface.encodeFunctionData("redeemUnderlying", [amount]);
  }

  borrowRawData(amount: bigint): string {
    return this.interface.encodeFunctionData("borrow", [amount]);
  }

  supplyRawData(isNative: boolean, amount: bigint): string {
    if (isNative) {
      return this.interface.encodeFunctionData("mint", []);
    } else {
      return this.interface.encodeFunctionData("mint", [amount]);
    }
  }

  repayBorrowRawData(isNative: boolean, amount: bigint): string {
    if (isNative) {
      return this.interface.encodeFunctionData("repayBorrow", []);
    } else {
      return this.interface.encodeFunctionData("repayBorrow", [amount]);
    }
  }
}
