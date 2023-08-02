import {
  Wallet,
  providers,
  Contract,
  ContractInterface,
  BigNumber,
} from "ethers";
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { erc20 } from "../abi/erc20";
import { lnSourceBridge } from "../abi/lnSourceBridge";
import { lnTargetBridge } from "../abi/lnTargetBridge";
import { GasPrice } from "../base/provider";

export const zeroAddress: string = "0x0000000000000000000000000000000000000000";
export const zeroTransferId: string = "0x0000000000000000000000000000000000000000000000000000000000000000";

export class EthereumContract {
  protected contract: Contract;
  public address: string;
  constructor(
    address: string,
    abi: ContractInterface,
    signer: Wallet | providers.Provider
  ) {
    this.contract = new Contract(address, abi, signer);
    this.address = address;
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

export interface TransferParameter {
  previousTransferId: string;
  relayer: string;
  sourceToken: string;
  targetToken: string;
  amount: BigNumber;
  timestamp: BigNumber;
  receiver: string;
}

export interface RelayArgs {
    transferParameter: TransferParameter;
    expectedTransferId: string;
}

export interface LnProviderConfigure {
    margin: BigNumber;
    baseFee: BigNumber;
    liquidityFeeRate: number;
}

export interface LnProviderInfo {
    config: LnProviderConfigure ;
    lastTransferId: string;
}

export interface LockInfo {
    fee: BigNumber;
    penalty: BigNumber;
    isLocked: boolean;
}

export class LnBridgeSourceContract extends EthereumContract {
    constructor(address: string, signer: Wallet | providers.Provider) {
        super(address, lnSourceBridge, signer);
    }

    async lnProviderInfo(relayer: string, token: string): Promise<LnProviderInfo> {
        const providerKey = await this.contract.getProviderKey(relayer, token);
        return await this.contract.lnProviders(providerKey);
    }

    async lockInfo(transferId: string): Promise<LockInfo> {
        return await this.contract.lockInfos(transferId);
    }

    async tryUpdateFee(
        token: string,
        baseFee: BigNumber,
        liquidityFeeRate: number,
        gasLimit: BigNumber | null = null
    ) {
        return this.staticCall(
            "updateProviderFeeAndMargin",
            [
                token,
                0,
                baseFee,
                liquidityFeeRate,
            ],
            gasLimit
        )
    }

    async updateFee(
        token: string,
        baseFee: BigNumber,
        liquidityFeeRate: number,
        gas: GasPrice,
        gasLimit: BigNumber | null = null
    ) {
        return await this.call(
            "updateProviderFeeAndMargin",
            [
                token,
                0,
                baseFee,
                liquidityFeeRate,
            ],
            gas,
            gasLimit
        );
    }
}

export class LnBridgeTargetContract extends EthereumContract {
  constructor(address: string, signer: Wallet | providers.Provider) {
    super(address, lnTargetBridge, signer);
  }

  async fillTransfers(transferId: string): Promise<string> {
    return await this.contract.fillTransfers(transferId);
  }

  async tryRelay(
    args: RelayArgs,
    gasLimit: BigNumber | null = null
  ): Promise<string> | null {
    var value = null;
    const parameter = args.transferParameter;
    if (parameter.targetToken === zeroAddress) {
      value = parameter.amount;
    }
    return this.staticCall(
      "transferAndReleaseMargin",
      [  
        [
          parameter.previousTransferId,
          parameter.relayer,
          parameter.sourceToken,
          parameter.targetToken,
          parameter.amount,
          parameter.timestamp,
          parameter.receiver,
        ],
        args.expectedTransferId,
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
    const parameter = args.transferParameter;
    if (parameter.targetToken === zeroAddress) {
      value = parameter.amount;
    }
    return await this.call(
      "transferAndReleaseMargin",
      [
        [
          parameter.previousTransferId,
          parameter.relayer,
          parameter.sourceToken,
          parameter.targetToken,
          parameter.amount,
          parameter.timestamp,
          parameter.receiver,
        ],
        args.expectedTransferId,
      ],
      gas,
      value,
      nonce,
      gasLimit
    );
  }
}
