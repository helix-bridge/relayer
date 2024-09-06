import { Wallet, HDNodeWallet, ethers, Contract, InterfaceAbi } from "ethers";
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { erc20 } from "../abi/erc20";
import { lnDefaultBridge } from "../abi/lnDefaultBridge";
import { lnOppositeBridge } from "../abi/lnOppositeBridge";
import { lnv3Bridge } from "../abi/lnv3Bridge";
import { abiSafe } from "../abi/abiSafe";
import { multicall3 } from "../abi/multicall3";
import { weth } from "../abi/weth";
import { GasPrice } from "../base/provider";
import { EthereumConnectedWallet } from "./wallet";
import { EthereumProvider, rpcCallIfError } from "./provider";

export const zeroAddress: string = "0x0000000000000000000000000000000000000000";
export const zeroTransferId: string =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export const LNV3_STATUS_LOCKED = 1;

export interface SoftLimitAmount {
  balance: bigint;
  allowance: bigint;
}

export interface MulticallArgs {
  address: string;
  data: string;
}

export class EthereumContract {
  protected contract: Contract;
  public address: string;
  public tryNextUrl: () => void;
  constructor(
    address: string,
    abi: InterfaceAbi,
    signer: EthereumConnectedWallet | EthereumProvider
  ) {
    this.contract = new Contract(address, abi, signer.SignerOrProvider);
    this.address = address;
    this.tryNextUrl = () => {
      signer.tryNextUrl();
    };
    signer.registerUrlUpdateHandler(() => {
      this.contract = new Contract(address, abi, signer.SignerOrProvider);
    });
  }

  get interface() {
    return this.contract.interface;
  }

  @rpcCallIfError
  async getSoftTransferLimit(
    relayer: string,
    targetToken: string,
    signer: EthereumProvider
  ): Promise<SoftLimitAmount> {
    // native token
    const provider = signer.SignerOrProvider as ethers.Provider;
    if (targetToken === zeroAddress) {
      const balance =
        ((await provider.getBalance(relayer)) * BigInt(9)) / BigInt(10);
      return {
        balance,
        allowance: balance,
      };
    } else {
      const targetTokenContract = new Erc20Contract(targetToken, signer);
      const balance = await targetTokenContract.balanceOf(relayer);
      const allowance = await targetTokenContract.allowance(
        relayer,
        this.address
      );
      return {
        balance,
        allowance,
      };
    }
  }

  @rpcCallIfError
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

  @rpcCallIfError
  async staticCall(
    method: string,
    args: any,
    hasReturnValue: boolean = false,
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
      const result = await this.contract[method].staticCall(...args);
      if (hasReturnValue) {
        return result;
      } else {
        return null;
      }
    } catch (error) {
      return error.message;
    }
  }
}

export class Erc20Contract extends EthereumContract {
  constructor(
    address: string,
    signer: EthereumConnectedWallet | EthereumProvider
  ) {
    super(address, erc20, signer);
  }

  // view
  @rpcCallIfError
  async symbol(): Promise<string> {
    return await this.contract.symbol();
  }

  @rpcCallIfError
  async name(): Promise<string> {
    return await this.contract.name();
  }

  @rpcCallIfError
  async decimals(): Promise<number> {
    return await this.contract.decimals();
  }

  @rpcCallIfError
  async balanceOf(address: string): Promise<bigint> {
    return await this.contract.balanceOf(address);
  }

  @rpcCallIfError
  async allowance(owner: string, spender: string): Promise<bigint> {
    return await this.contract.allowance(owner, spender);
  }

  // call
  async approve(
    address: string,
    amount: bigint,
    gas: GasPrice
  ): Promise<TransactionResponse> {
    return await this.call("approve", [address, amount], gas, null, null, null);
  }

  approveRawData(spender: string, amount: bigint): string {
    return this.interface.encodeFunctionData("approve", [spender, amount]);
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

export interface RelayRawData {
  data: string;
  value: bigint;
}

export class SafeContract extends EthereumContract {
  constructor(
    address: string,
    signer: EthereumConnectedWallet | EthereumProvider
  ) {
    super(address, abiSafe, signer);
  }

  async tryExecTransaction(
    to: string,
    data: string,
    innervalue: bigint,
    operation: number,
    signatures: string,
    value: bigint | null = null
  ): Promise<string> | null {
    return await this.staticCall(
      "execTransaction",
      [
        to,
        innervalue,
        data,
        operation,
        0,
        0,
        0,
        zeroAddress,
        zeroAddress,
        signatures,
      ],
      false,
      value
    );
  }

  async execTransaction(
    to: string,
    data: string,
    innervalue: bigint,
    operation: number,
    signatures: string,
    gas: GasPrice,
    nonce: number | null = null,
    gasLimit: bigint | null = null,
    value: bigint | null = null
  ): Promise<TransactionResponse> {
    return await this.call(
      "execTransaction",
      [
        to,
        innervalue,
        data,
        operation,
        0,
        0,
        0,
        zeroAddress,
        zeroAddress,
        signatures,
      ],
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
    signer: EthereumConnectedWallet | EthereumProvider,
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

  @rpcCallIfError
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
    targetToken: string
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
        false,
        null,
        gasLimit
      );
    } else {
      return await this.staticCall(
        "updateProviderFeeAndMargin",
        [remoteChainId, sourceToken, targetToken, 0, baseFee, liquidityFeeRate],
        false,
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

  @rpcCallIfError
  async transferIdExist(transferId: string): Promise<[boolean, any]> {
    const lockInfo = await this.contract.lockInfos(transferId);
    return [lockInfo.timestamp > 0, lockInfo];
  }

  @rpcCallIfError
  async transferHasFilled(transferId: string): Promise<boolean> {
    const fillInfo = await this.contract.fillTransfers(transferId);
    if (this.bridgeType === "lnv2-default") {
      return fillInfo.timestamp > 0;
    } else {
      return fillInfo != zeroTransferId;
    }
  }

  @rpcCallIfError
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
      false,
      value,
      gasLimit
    );
  }

  relayRawData(args: RelayArgs | RelayArgsV3): RelayRawData {
    var value = null;
    const argsV2 = args as RelayArgs;
    const parameter = argsV2.transferParameter;
    if (parameter.targetToken === zeroAddress) {
      value = parameter.amount;
    }
    const data = this.interface.encodeFunctionData("transferAndReleaseMargin", [
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
    return { data, value };
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
    signer: EthereumConnectedWallet | EthereumProvider
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

  private getProviderStateKey(provider: string, sourceToken: string) {
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

  @rpcCallIfError
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

  @rpcCallIfError
  async getLnProviderPenalty(
    relayer: string,
    sourceToken: string
  ): Promise<bigint> {
    const providerStateKey = this.getProviderStateKey(sourceToken, relayer);
    return await this.contract.penaltyReserves(providerStateKey);
  }

  @rpcCallIfError
  async getTokenBasePenalty(
    remoteChainId: number,
    sourceToken: string,
    targetToken: string
  ): Promise<bigint> {
    const tokenKey = this.getTokenKey(remoteChainId, sourceToken, targetToken);
    return (await this.contract.tokenInfos(tokenKey)).config.penalty;
  }

  async isPenaltyEnough(
    remoteChainId: number,
    relayer: string,
    sourceToken: string,
    targetToken: string
  ): Promise<boolean> {
    // get token base penalty
    const basePenalty = await this.getTokenBasePenalty(
      remoteChainId,
      sourceToken,
      targetToken
    );
    const providerPenalty = await this.getLnProviderPenalty(
      relayer,
      sourceToken
    );
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
      false,
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
      [remoteChainId, transferIds, provider, extParams],
      false,
      value,
      gasLimit
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
      [remoteChainId, transferIds, provider, extParams],
      gas,
      value
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

  encodeUpdateFee(
    remoteChainId: number,
    sourceToken: string,
    targetToken: string,
    baseFee: bigint,
    liquidityFeeRate: number,
    transferLimit: bigint
  ): string {
    return this.interface.encodeFunctionData("registerLnProvider", [
      remoteChainId,
      sourceToken,
      targetToken,
      baseFee,
      liquidityFeeRate,
      transferLimit,
    ]);
  }

  encodeDepositPenaltyReserve(sourceToken: string, amount: bigint): string {
    return this.interface.encodeFunctionData("depositPenaltyReserve", [
      sourceToken,
      amount,
    ]);
  }

  @rpcCallIfError
  async transferIdExist(transferId: string): Promise<[boolean, any]> {
    const lockInfo = await this.contract.lockInfos(transferId);
    return [lockInfo.status == LNV3_STATUS_LOCKED, lockInfo];
  }

  @rpcCallIfError
  async transferHasFilled(transferId: string): Promise<boolean> {
    const fillInfo = await this.contract.fillTransfers(transferId);
    return fillInfo.timestamp > 0;
  }

  @rpcCallIfError
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
      false,
      value,
      gasLimit
    );
  }

  relayRawData(args: RelayArgsV3 | RelayArgs): RelayRawData {
    var value = null;
    const argsV3 = args as RelayArgsV3;
    const parameter = argsV3.transferParameter;
    if (parameter.targetToken === zeroAddress) {
      value = parameter.targetAmount;
    }
    const data = this.interface.encodeFunctionData("relay", [
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
    return { data, value };
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

  encodeWithdrawLiquidity(
    transferIds: string[],
    chainId: number,
    provider: string
  ): string {
    return this.interface.encodeFunctionData("withdrawLiquidity", [
      transferIds,
      chainId,
      provider,
    ]);
  }
}

export class WETHContract extends EthereumContract {
  constructor(
    address: string,
    signer: EthereumConnectedWallet | EthereumProvider
  ) {
    super(address, weth, signer);
  }

  withdrawRawData(amount: bigint): string {
    return this.interface.encodeFunctionData("withdraw", [amount]);
  }

  depositRawData(): string {
    return this.interface.encodeFunctionData("deposit", []);
  }
}

export class MulticallContract extends EthereumContract {
  constructor(
    address: string,
    signer: EthereumConnectedWallet | EthereumProvider
  ) {
    super(address, multicall3, signer);
  }

  // address == 0: native balance
  async getBalance(account: string, addresses: string[]): Promise<bigint[]> {
    let args = [];
    for (const address of addresses) {
      if (address === zeroAddress) {
        args.push([
          this.address,
          this.interface.encodeFunctionData("getEthBalance", [account]),
        ]);
      } else {
        args.push([
          address,
          this.interface.encodeFunctionData("balanceOf", [account]),
        ]);
      }
    }
    const response = await this.staticCall("aggregate", [args], true, null);
    let result: bigint[] = [];
    const balances = response[1];
    for (const balance of balances) {
      result.push(BigInt(balance));
    }
    return result;
  }

  async aggregate(args: MulticallArgs[]): Promise<string> {
    const aggregateArgs = args.map((arg) => [arg.address, arg.data]);
    let result = await this.staticCall(
      "aggregate",
      [aggregateArgs],
      true,
      null
    );
    return result;
  }
}
