import { ethers } from "ethers";
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

export class EthereumProvider {
  public provider: ethers.JsonRpcProvider;

  constructor(url: string) {
    this.provider = new ethers.JsonRpcProvider(url);
  }

  async currentBlocknumber() {
    return await this.provider.getBlockNumber();
  }

  async balanceOf(address: string): Promise<bigint> {
    return await this.provider.getBalance(address);
  }

  async feeData(
    scale: number,
    notSupport1559: boolean = false
  ): Promise<GasPrice> {
    const fee = await this.provider.getFeeData();
    if (!notSupport1559 && fee.maxFeePerGas && fee.maxPriorityFeePerGas) {
      const maxFeePerGas = fee.maxFeePerGas > fee.maxFeePerGas
        ? fee.maxFeePerGas
        : fee.maxFeePerGas;
      const feeInfo: EIP1559Fee = {
        // maxFeePerGas is not accurate
        //maxFeePerGas: fee.maxFeePerGas,
        maxFeePerGas: maxFeePerGas * BigInt(scale),
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas * BigInt(scale),
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
          gasPrice: fee.gasPrice * BigInt(scale),
        },
        eip1559fee: null,
      };
    }
  }

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
