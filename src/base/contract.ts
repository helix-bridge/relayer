import { Wallet, HDNodeWallet, ethers, Contract, InterfaceAbi } from "ethers";
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { erc20 } from "../abi/erc20";
import { lnDefaultBridge } from "../abi/lnDefaultBridge";
import { lnOppositeBridge } from "../abi/lnOppositeBridge";
import { lnv3Bridge } from "../abi/lnv3Bridge";
import { abiSafe } from "../abi/abiSafe";
import { GasPrice } from "../base/provider";

export const zeroAddress: string = "0x0000000000000000000000000000000000000000";
export const zeroTransferId: string =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export const LNV3_STATUS_LOCKED = 1;

export class EthereumContract {
  protected contract: Contract;
  public address: string;
  constructor(
    address: string,
    abi: InterfaceAbi,
    signer: Wallet | HDNodeWallet | ethers.Provider
  ) {
    this.contract = new Contract(address, abi, signer);
    this.address = address;
  }

  get interface() {
    return this.contract.interface;
  }

  async getSoftTransferLimit(
    relayer: string,
    targetToken: string,
    provider: ethers.Provider
  ): Promise<bigint> {
    // native token
    if (targetToken === zeroAddress) {
        return await provider.getBalance(relayer) * BigInt(9) / BigInt(10);
    } else {
        const targetTokenContract = new Erc20Contract(targetToken, provider)
        const balance = await targetTokenContract.balanceOf(relayer);
        const allowance = await targetTokenContract.allowance(relayer, this.address);
        return balance < allowance ? balance: allowance;
    }
  }

  async call(
    method: string,
    args: any,
    gas: GasPrice,
    value: bigint | null = null,
    nonce: number | null = null,
    gasLimit: bigint | null = null
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
    value: bigint | null = null,
    gasLimit: bigint | null = null,
    from: string | null = null
  ): Promise<string> | null {
    try {
      var options = {};
      if (value != null) {
        options = { value: value };
      }
      if (from != null) {
        options[from] = from;
      }
      if (value != null) {
        args = [...args, options];
      }
      await this.contract[method].staticCall(...args);
      return null;
    } catch (error) {
      return error.message;
    }
  }
}

export class Erc20Contract extends EthereumContract {
  constructor(
    address: string,
    signer: Wallet | HDNodeWallet | ethers.Provider
  ) {
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

  async balanceOf(address: string): Promise<bigint> {
    return await this.contract.balanceOf(address);
  }

  async allowance(owner: string, spender: string): Promise<bigint> {
    return await this.contract.allowance(owner, spender);
  }

  // call
  async approve(
    address: string,
    amount: bigint,
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
  amount: bigint;
  timestamp: bigint;
  receiver: string;
}

export interface RelayArgs {
  transferParameter: TransferParameter;
  remoteChainId: number;
  expectedTransferId: string;
}

export interface TransferParameterV3 {
  remoteChainId: number;
  provider: string;
  sourceToken: string;
  targetToken: string;
  sourceAmount: bigint;
  targetAmount: bigint;
  receiver: string;
  timestamp: bigint;
}

export interface RelayArgsV3 {
  transferParameter: TransferParameterV3;
  expectedTransferId: string;
}

export interface LnProviderFeeInfo {
  baseFee: bigint;
  liquidityFeeRate: number;
  transferLimit: bigint;
}

export class SafeContract extends EthereumContract {
  constructor(
    address: string,
    signer: Wallet | HDNodeWallet | ethers.Provider
  ) {
    super(address, abiSafe, signer);
  }

  async tryExecTransaction(
    to: string,
    data: string,
    signatures: string,
    value: bigint | null = null
  ): Promise<string> | null {
    return await this.staticCall(
      "execTransaction",
      [to, 0, data, 0, 0, 0, 0, zeroAddress, zeroAddress, signatures],
      value
    );
  }

  async execTransaction(
    to: string,
    data: string,
    signatures: string,
    gas: GasPrice,
    nonce: number | null = null,
    gasLimit: bigint | null = null,
    value: bigint | null = null
  ): Promise<TransactionResponse> {
    return await this.call(
      "execTransaction",
      [to, 0, data, 0, 0, 0, 0, zeroAddress, zeroAddress, signatures],
      gas,
      value,
      nonce,
      gasLimit
    );
  }
}

export class LnBridgeContract extends EthereumContract {
  private bridgeType: string;
  constructor(
    address: string,
    signer: Wallet | HDNodeWallet | ethers.Provider,
    bridgeType: string
  ) {
    if (bridgeType === "lnv2-default") {
      super(address, lnDefaultBridge, signer);
    } else {
      super(address, lnOppositeBridge, signer);
    }
    this.bridgeType = bridgeType;
  }

  private getProviderKey(
    remoteChainId: number,
    provider: string,
    sourceToken: string,
    targetToken: string
  ) {
    const encode = ethers.solidityPacked(
      ["uint256", "address", "address", "address"],
      [remoteChainId, provider, sourceToken, targetToken]
    );
    return ethers.keccak256(encode);
  }

  async getLnProviderInfo(
    remoteChainId: number,
    relayer: string,
    sourceToken: string,
    targetToken: string
  ): Promise<LnProviderFeeInfo> {
    const providerKey = await this.getProviderKey(
      remoteChainId,
      relayer,
      sourceToken,
      targetToken
    );
    const lnProviderInfo = await this.contract.srcProviders(providerKey);
    return {
      baseFee: lnProviderInfo.config.baseFee,
      liquidityFeeRate: lnProviderInfo.config.liquidityFeeRate,
      transferLimit: BigInt(0),
    };
  }

  async isPenaltyEnough(
    remoteChainId: number,
    relayer: string,
    sourceToken: string,
    targetToken: string,
  ): Promise<boolean> {
    return true;
  }

  async tryUpdateFee(
    remoteChainId: number,
    sourceToken: string,
    targetToken: string,
    baseFee: bigint,
    liquidityFeeRate: number,
    transferLimit: bigint,
    gasLimit: bigint | null = null
  ) {
    if (this.bridgeType === "lnv2-default") {
      return await this.staticCall(
        "setProviderFee",
        [remoteChainId, sourceToken, targetToken, baseFee, liquidityFeeRate],
        null,
        gasLimit
      );
    } else {
      return await this.staticCall(
        "updateProviderFeeAndMargin",
        [remoteChainId, sourceToken, targetToken, 0, baseFee, liquidityFeeRate],
        null,
        gasLimit
      );
    }
  }

  async updateFee(
    remoteChainId: number,
    sourceToken: string,
    targetToken: string,
    baseFee: bigint,
    liquidityFeeRate: number,
    transferLimit: bigint,
    gas: GasPrice,
    gasLimit: bigint | null = null
  ) {
    if (this.bridgeType === "lnv2-default") {
      return await this.call(
        "setProviderFee",
        [remoteChainId, sourceToken, targetToken, baseFee, liquidityFeeRate],
        gas,
        gasLimit
      );
    } else {
      return await this.call(
        "updateProviderFeeAndMargin",
        [remoteChainId, sourceToken, targetToken, 0, baseFee, liquidityFeeRate],
        gas,
        gasLimit
      );
    }
  }

  async transferIdExist(transferId: string): Promise<[boolean, any]> {
    const lockInfo = await this.contract.lockInfos(transferId);
    return [lockInfo.timestamp > 0, lockInfo];
  }

  async transferHasFilled(transferId: string): Promise<boolean> {
    const fillInfo = await this.contract.fillTransfers(transferId);
    if (this.bridgeType === "lnv2-default") {
      return fillInfo.timestamp > 0;
    } else {
      return fillInfo != zeroTransferId;
    }
  }

  async fillTransfers(transferId: string): Promise<any> {
    return await this.contract.fillTransfers(transferId);
  }

  async tryRelay(
    args: RelayArgs | RelayArgsV3,
    gasLimit: bigint | null = null
  ): Promise<string> | null {
    const argsV2 = args as RelayArgs;
    var value = null;
    const parameter = argsV2.transferParameter;
    if (parameter.targetToken === zeroAddress) {
      value = parameter.amount;
    }
    return await this.staticCall(
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
        argsV2.remoteChainId,
        argsV2.expectedTransferId,
      ],
      value,
      gasLimit
    );
  }

  relayRawData(args: RelayArgs | RelayArgsV3): string {
    var value = null;
    const argsV2 = args as RelayArgs;
    const parameter = argsV2.transferParameter;
    if (parameter.targetToken === zeroAddress) {
      value = parameter.amount;
    }
    return this.interface.encodeFunctionData("transferAndReleaseMargin", [
      [
        parameter.previousTransferId,
        parameter.relayer,
        parameter.sourceToken,
        parameter.targetToken,
        parameter.amount,
        parameter.timestamp,
        parameter.receiver,
      ],
      argsV2.remoteChainId,
      argsV2.expectedTransferId,
    ]);
  }

  async relay(
    args: RelayArgs | RelayArgsV3,
    gas: GasPrice,
    nonce: number | null = null,
    gasLimit: bigint | null = null
  ): Promise<TransactionResponse> {
    var value = null;
    const argsV2 = args as RelayArgs;
    const parameter = argsV2.transferParameter;
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
        argsV2.remoteChainId,
        argsV2.expectedTransferId,
      ],
      gas,
      value,
      nonce,
      gasLimit
    );
  }
}

export class Lnv3BridgeContract extends EthereumContract {
  constructor(
    address: string,
    signer: Wallet | HDNodeWallet | ethers.Provider
  ) {
    super(address, lnv3Bridge, signer);
  }

  private getProviderKey(
    remoteChainId: number,
    provider: string,
    sourceToken: string,
    targetToken: string
  ) {
    const encode = ethers.solidityPacked(
      ["uint256", "address", "address", "address"],
      [remoteChainId, provider, sourceToken, targetToken]
    );
    return ethers.keccak256(encode);
  }

  private getProviderStateKey(
    provider: string,
    sourceToken: string
  ) {
    const encode = ethers.solidityPacked(
      ["address", "address"],
      [provider, sourceToken]
    );
    return ethers.keccak256(encode);
  }

  private getTokenKey(
    remoteChainId: number,
    sourceToken: string,
    targetToken: string
  ) {
    const encode = ethers.solidityPacked(
      ["uint256", "address", "address"],
      [remoteChainId, sourceToken, targetToken]
    );
    return ethers.keccak256(encode);
  }

  async getLnProviderInfo(
    remoteChainId: number,
    relayer: string,
    sourceToken: string,
    targetToken: string
  ): Promise<LnProviderFeeInfo> {
    const providerKey = this.getProviderKey(
      remoteChainId,
      relayer,
      sourceToken,
      targetToken
    );
    const lnProviderInfo = await this.contract.srcProviders(providerKey);
    return {
      baseFee: lnProviderInfo.baseFee,
      liquidityFeeRate: lnProviderInfo.liquidityFeeRate,
      transferLimit: lnProviderInfo.transferLimit,
    };
  }

  async getLnProviderPenalty(
    relayer: string,
    sourceToken: string,
  ): Promise<bigint> {
    const providerStateKey = this.getProviderStateKey(
      sourceToken,
      relayer
    );
    return await this.contract.penaltyReserves(providerStateKey);
  }

  async getTokenBasePenalty(
    remoteChainId: number,
    sourceToken: string,
    targetToken: string,
  ): Promise<bigint> {
    const tokenKey = this.getTokenKey(
      remoteChainId,
      sourceToken,
      targetToken
    );
    return (await this.contract.tokenInfos(tokenKey)).config.penalty;
  }

  async isPenaltyEnough(
    remoteChainId: number,
    relayer: string,
    sourceToken: string,
    targetToken: string,
  ): Promise<boolean> {
      // get token base penalty
      const basePenalty = await this.getTokenBasePenalty(remoteChainId, sourceToken, targetToken);
      const providerPenalty = await this.getLnProviderPenalty(relayer, sourceToken);
      return providerPenalty > basePenalty;
  }

  async tryUpdateFee(
    remoteChainId: number,
    sourceToken: string,
    targetToken: string,
    baseFee: bigint,
    liquidityFeeRate: number,
    transferLimit: bigint,
    gasLimit: bigint | null = null
  ) {
    return await this.staticCall(
      "registerLnProvider",
      [
        remoteChainId,
        sourceToken,
        targetToken,
        baseFee,
        liquidityFeeRate,
        transferLimit,
      ],
      null,
      gasLimit
    );
  }

  async tryWithdrawLiquidity(
    remoteChainId: number,
    transferIds: string[],
    provider: string,
    extParams: string,
    value: bigint,
    gasLimit: bigint | null = null
  ): Promise<string> | null {
    return await this.staticCall(
      "requestWithdrawLiquidity",
      [
        remoteChainId,
        transferIds,
        provider,
        extParams
      ],
      value,
      gasLimit,
    );
  }

  async withdrawLiquidity(
    remoteChainId: number,
    transferIds: string[],
    provider: string,
    extParams: string,
    gas: GasPrice,
    value: bigint,
    gasLimit: bigint | null = null
  ) {
    return await this.call(
      "requestWithdrawLiquidity",
      [
        remoteChainId,
        transferIds,
        provider,
        extParams
      ],
      gas,
      value,
    );
  }

  async updateFee(
    remoteChainId: number,
    sourceToken: string,
    targetToken: string,
    baseFee: bigint,
    liquidityFeeRate: number,
    transferLimit: bigint,
    gas: GasPrice,
    gasLimit: bigint | null = null
  ) {
    return await this.call(
      "registerLnProvider",
      [
        remoteChainId,
        sourceToken,
        targetToken,
        baseFee,
        liquidityFeeRate,
        transferLimit,
      ],
      gas,
      gasLimit
    );
  }

  async transferIdExist(transferId: string): Promise<[boolean, any]> {
    const lockInfo = await this.contract.lockInfos(transferId);
    return [lockInfo.status == LNV3_STATUS_LOCKED, lockInfo];
  }

  async transferHasFilled(transferId: string): Promise<boolean> {
    const fillInfo = await this.contract.fillTransfers(transferId);
    return fillInfo.timestamp > 0;
  }

  async fillTransfers(transferId: string): Promise<any> {
    return await this.contract.fillTransfers(transferId);
  }

  async tryRelay(
    args: RelayArgsV3 | RelayArgs,
    gasLimit: bigint | null = null
  ): Promise<string> | null {
    var value = null;
    const argsV3 = args as RelayArgsV3;
    const parameter = argsV3.transferParameter;
    if (parameter.targetToken === zeroAddress) {
      value = parameter.targetAmount;
    }
    return await this.staticCall(
      "relay",
      [
        [
          parameter.remoteChainId,
          parameter.provider,
          parameter.sourceToken,
          parameter.targetToken,
          parameter.sourceAmount,
          parameter.targetAmount,
          parameter.receiver,
          parameter.timestamp,
        ],
        argsV3.expectedTransferId,
        true,
      ],
      value,
      gasLimit
    );
  }

  relayRawData(args: RelayArgsV3 | RelayArgs): string {
    var value = null;
    const argsV3 = args as RelayArgsV3;
    const parameter = argsV3.transferParameter;
    if (parameter.targetToken === zeroAddress) {
      value = parameter.targetAmount;
    }
    return this.interface.encodeFunctionData("relay", [
      [
        parameter.remoteChainId,
        parameter.provider,
        parameter.sourceToken,
        parameter.targetToken,
        parameter.sourceAmount,
        parameter.targetAmount,
        parameter.receiver,
        parameter.timestamp,
      ],
      argsV3.expectedTransferId,
      true,
    ]);
  }

  async relay(
    args: RelayArgsV3 | RelayArgs,
    gas: GasPrice,
    nonce: number | null = null,
    gasLimit: bigint | null = null
  ): Promise<TransactionResponse> {
    var value = null;
    const argsV3 = args as RelayArgsV3;
    const parameter = argsV3.transferParameter;
    if (parameter.targetToken === zeroAddress) {
      value = parameter.targetAmount;
    }
    return await this.call(
      "relay",
      [
        [
          parameter.remoteChainId,
          parameter.provider,
          parameter.sourceToken,
          parameter.targetToken,
          parameter.sourceAmount,
          parameter.targetAmount,
          parameter.receiver,
          parameter.timestamp,
        ],
        argsV3.expectedTransferId,
        true,
      ],
      gas,
      value,
      nonce,
      gasLimit
    );
  }

  encodeWithdrawLiquidity(transferIds: string[], chainId: number, provider: string): string {
    return this.interface.encodeFunctionData("withdrawLiquidity", [
      transferIds,
      chainId,
      provider
    ]);
  }
}
