import { ethers, BigNumber } from "ethers";

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

    async feeData(): Promise<GasPrice> {
        const fee = await this.provider.getFeeData();
        if (fee.maxFeePerGas && fee.maxPriorityFeePerGas) {
            const feeInfo: EIP1559Fee = {
                maxFeePerGas: fee.maxFeePerGas,
                maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
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
                    gasPrice: fee.gasPrice
                },
                eip1559fee: null,
            }
        }
    }

    async checkPendingTransaction(hash: string): Promise<number> {
        const transaction = await this.provider.getTransaction(hash);
        if (!transaction || transaction.blockNumber == null) {
            return 0;
        }
        return transaction.confirmations;
    }
}
