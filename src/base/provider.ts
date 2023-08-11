import { ethers, BigNumber } from "ethers";
import { GWei } from "./bignumber";

export interface EIP1559Fee {
  maxFeePerGas: BigNumber;
  maxPriorityFeePerGas: BigNumber;
}

export interface GasFee {
  gasPrice: BigNumber;
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
    return leftGasPrice.lt(rightGasPrice.mul(scale).Number);
  } else {
    const leftGasPrice = left.fee.gasPrice;
    const rightGasPrice = new GWei(right.fee.gasPrice);
    return leftGasPrice.lt(rightGasPrice.mul(scale).Number);
  }
}

export class EthereumProvider {
  public provider: ethers.providers.JsonRpcProvider;

  constructor(url: string) {
    this.provider = new ethers.providers.JsonRpcProvider(url);
  }

  get currentBlocknumber() {
    return this.provider.blockNumber;
  }

  async balanceOf(address: string): Promise<BigNumber> {
    return await this.provider.getBalance(address);
  }

  async gasPrice(): Promise<BigNumber> {
    return await this.provider.getGasPrice();
  }

  async feeData(scale: number): Promise<GasPrice> {
    const fee = await this.provider.getFeeData();
    if (fee.maxFeePerGas && fee.maxPriorityFeePerGas) {
      const maxFeePerGas = fee.maxFeePerGas.gt(fee.maxFeePerGas) ? fee.maxFeePerGas : fee.maxFeePerGas;
      const feeInfo: EIP1559Fee = {
        // maxFeePerGas is not accurate
        //maxFeePerGas: fee.maxFeePerGas,
        maxFeePerGas: maxFeePerGas.mul(scale),
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas.mul(scale),
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
          gasPrice: fee.gasPrice.mul(scale),
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
      confirmedBlock: transaction.confirmations,
      nonce: null,
    };
  }
}
