import { Logger } from "@nestjs/common";
import { Wallet, HDNodeWallet, ethers } from "ethers";
import { GWei } from "./bignumber";

export interface EIP1559Fee {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface GasFee {
  gasPrice: bigint;
}

export interface GasPrice {
  eip1559fee: EIP1559Fee | null;
  fee: GasFee | null;
  isEip1559: boolean;
}

export interface TransactionInfo {
  gasPrice: GasPrice | null;
  confirmedBlock: number;
  nonce: number | null;
}

export function scaleBigger(
  left: GasPrice,
  right: GasPrice,
  scale: number
): boolean {
  if (left.isEip1559) {
    const leftGasPrice = left.eip1559fee.maxFeePerGas;
    const rightGasPrice = new GWei(right.eip1559fee.maxFeePerGas);
    return leftGasPrice < rightGasPrice.mul(scale).Number;
  } else {
    const leftGasPrice = left.fee.gasPrice;
    const rightGasPrice = new GWei(right.fee.gasPrice);
    return leftGasPrice < rightGasPrice.mul(scale).Number;
  }
}

export function rpcCallIfError(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
) {
  const method = descriptor.value;
  descriptor.value = async function (...args: any[]) {
    try {
      return await method.apply(this, args);
    } catch (err) {
      this.tryNextUrl();
      throw err;
    }
  };
}

export class EthereumProvider {
  public provider: ethers.JsonRpcProvider;
  public onUrlUpdatedHandlers: (() => void)[] = [];
  public urls: string[];
  public urlIndex: number = 0;
  private readonly logger = new Logger("provider");
  private updateTimestamp: number = 0;

  constructor(urls: string[]) {
    this.urls = urls;
    this.provider = new ethers.JsonRpcProvider(urls[0]);
  }

  tryNextUrl() {
    const now = Date.now();
    if (this.urls.length <= 1 || this.updateTimestamp + 60000 > now) {
      return;
    }
    this.updateTimestamp = now;
    this.urlIndex += 1;
    const url = this.urls[this.urlIndex % this.urls.length];
    this.logger.log(`try to use next url ${url}`);
    this.provider.destroy();
    this.provider = new ethers.JsonRpcProvider(url);
    for (const handler of this.onUrlUpdatedHandlers) {
      handler();
    }
  }

  registerUrlUpdateHandler(handler: () => void) {
    this.onUrlUpdatedHandlers.push(handler);
  }

  get SignerOrProvider(): Wallet | HDNodeWallet | ethers.Provider {
    return this.provider;
  }

  @rpcCallIfError
  async currentBlocknumber() {
    return await this.provider.getBlockNumber();
  }

  @rpcCallIfError
  async balanceOf(address: string): Promise<bigint> {
    return await this.provider.getBalance(address);
  }

  @rpcCallIfError
  async feeData(
    scale: number,
    notSupport1559: boolean = false
  ): Promise<GasPrice> {
    const fee = await this.provider.getFeeData();
    const stretchScale = BigInt(Math.floor(scale * 100));
    if (!notSupport1559 && fee.maxFeePerGas && fee.maxPriorityFeePerGas) {
      const maxFeePerGas =
        fee.maxFeePerGas > fee.maxFeePerGas
          ? fee.maxFeePerGas
          : fee.maxFeePerGas;
      const feeInfo: EIP1559Fee = {
        // maxFeePerGas is not accurate
        //maxFeePerGas: fee.maxFeePerGas,
        maxFeePerGas: maxFeePerGas * stretchScale / BigInt(100),
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas * stretchScale / BigInt(100),
      };
      return {
        eip1559fee: feeInfo,
        isEip1559: true,
        fee: null,
      };
    } else {
      return {
        isEip1559: false,
        fee: {
          gasPrice: fee.gasPrice * stretchScale / BigInt(100),
        },
        eip1559fee: null,
      };
    }
  }

  @rpcCallIfError
  async checkPendingTransaction(hash: string): Promise<TransactionInfo> | null {
    const transaction = await this.provider.getTransaction(hash);
    if (!transaction) {
      return null;
    }
    if (transaction.blockNumber == null) {
      if (transaction.maxFeePerGas && transaction.maxPriorityFeePerGas) {
        return {
          gasPrice: {
            eip1559fee: {
              maxFeePerGas: transaction.maxFeePerGas,
              maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
            },
            isEip1559: true,
            fee: null,
          },
          confirmedBlock: 0,
          nonce: transaction.nonce,
        };
      } else {
        return {
          gasPrice: {
            eip1559fee: null,
            isEip1559: false,
            fee: {
              gasPrice: transaction.gasPrice,
            },
          },
          confirmedBlock: 0,
          nonce: transaction.nonce,
        };
      }
    }
    return {
      gasPrice: null,
      confirmedBlock: await transaction.confirmations(),
      nonce: null,
    };
  }
}
