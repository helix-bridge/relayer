import {
  Wallet,
  providers,
  Contract,
  ContractInterface,
  BigNumber,
} from "ethers";
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { erc20 } from "../abi/erc20";
import { lpSub2SubBridge } from "../abi/lpbridge";
import { uniswap } from "../abi/uniswap";
import { GasPrice } from "../base/provider";

export class EthereumContract {
  protected contract: Contract;
  constructor(
    address: string,
    abi: ContractInterface,
    signer: Wallet | providers.Provider
  ) {
    this.contract = new Contract(address, abi, signer);
  }

  async call(
    method: string,
    args: any,
    gas: GasPrice,
    value: BigNumber | null = null,
    nonce: number | null = null,
    gasLimit: BigNumber | null = null
  ): Promise<TransactionResponse> {
    const gasArgs = gas.isEip1559 ? gas.eip1559fee : gas.fee;
    const txConfig = Object.entries({
      ...gasArgs,
      value,
      nonce,
      gasLimit,
    }).reduce((c, [k, v]) => (v ? ((c[k] = v), c) : c), {});
    return await this.contract[method](...args, txConfig);
  }

  async staticCall(
    method: string,
    args: any,
    value: BigNumber | null = null,
    gasLimit: BigNumber | null = null
  ): Promise<string> | null {
    try {
      if (value != null) {
        args = [...args, { value: value }];
      }
      await this.contract.callStatic[method](...args);
      return null;
    } catch (error) {
      return error.message;
    }
  }
}

export class Erc20Contract extends EthereumContract {
  constructor(address: string, signer: Wallet | providers.Provider) {
    super(address, erc20, signer);
  }

  // view
  async symbol(): Promise<string> {
    return await this.contract.symbol();
  }

  async name(): Promise<string> {
    return await this.contract.name();
  }

  async decimals(): Promise<number> {
    return await this.contract.decimals();
  }

  async balanceOf(address: string): Promise<BigNumber> {
    return await this.contract.balanceOf(address);
  }

  // call
  async approve(
    address: string,
    amount: BigNumber,
    gas: GasPrice
  ): Promise<TransactionResponse> {
    return this.call("approve", [address, amount], gas, null, null, null);
  }
}

export interface TokenInfo {
  localToken: string;
  remoteToken: string;
  helixFee: BigNumber;
  remoteChainId: BigNumber;
  localDecimals: number;
  remoteDecimals: number;
  remoteIsNative: boolean;
}

export interface RelayArgs {
  messageNonce: BigNumber;
  token: string;
  sender: string;
  receiver: string;
  amount: BigNumber;
  sourceChainId: BigNumber;
  issuingNative: boolean;
}

export class LpSub2SubBridgeContract extends EthereumContract {
  constructor(address: string, signer: Wallet | providers.Provider) {
    super(address, lpSub2SubBridge, signer);
  }

  async tokens(index: number): Promise<TokenInfo> {
    const token = await this.contract.tokens(index);
    const info: TokenInfo = {
      localToken: token[0],
      remoteToken: token[1],
      helixFee: token[2],
      remoteChainId: token[3],
      localDecimals: token[4],
      remoteDecimals: token[5],
      remoteIsNative: token[6],
    };
    return info;
  }

  async tokenLength(): Promise<BigNumber> {
    return await this.contract.tokenLength();
  }

  async issuedMessages(transferId: string): Promise<string> {
    return await this.contract.issuedMessages(transferId);
  }

  async tryRelay(
    args: RelayArgs,
    gasLimit: BigNumber | null = null
  ): Promise<string> | null {
    var value = null;
    if (args.issuingNative === true) {
      value = args.amount;
    }
    return this.staticCall(
      "relay",
      [
        args.messageNonce,
        args.token,
        args.sender,
        args.receiver,
        args.amount,
        args.sourceChainId,
        args.issuingNative,
      ],
      value,
      gasLimit
    );
  }

  async relay(
    args: RelayArgs,
    gas: GasPrice,
    nonce: number | null = null,
    gasLimit: BigNumber | null = null
  ): Promise<TransactionResponse> {
    var value = null;
    if (args.issuingNative === true) {
      value = args.amount;
    }
    return await this.call(
      "relay",
      [
        args.messageNonce,
        args.token,
        args.sender,
        args.receiver,
        args.amount,
        args.sourceChainId,
        args.issuingNative,
      ],
      gas,
      value,
      nonce,
      gasLimit
    );
  }
}

export class UniswapContract extends EthereumContract {
  constructor(address: string, signer: Wallet | providers.Provider) {
    super(address, uniswap, signer);
  }

  async getAmountsOut(amountIn: BigNumber, path: string[]): Promise<BigNumber> {
    const amountsOut = await this.contract.getAmountsOut(amountIn, path);
    return amountsOut[amountsOut.length - 1];
  }

  async weth(): Promise<string> {
    return await this.contract.WETH();
  }
}
