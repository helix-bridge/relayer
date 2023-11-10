import { SafeTransactionDataPartial, SafeMultisigTransactionResponse } from '@safe-global/safe-core-sdk-types';
import Safe, {EthersAdapter} from '@safe-global/protocol-kit';
import SafeApiKit from '@safe-global/api-kit'
import { ethers } from 'ethers';
const ApiKit = require('@safe-global/api-kit');

type Opts = {
    allowedDomains?: RegExp[];
    debug?: boolean;
};

export interface TransactionPropose {
    to: string;
    readyExecute: boolean;
    safeTxHash: string;
    txData: string;
    signatures: string;
}

export class SafeWallet {
    public address: string;
    public apiService: string;
    public signer: ethers.Wallet;
    private safeSdk: Safe;
    private safeService: SafeApiKit;
    constructor(address: string, apiService: string, signer: ethers.Wallet){
        this.address = address;
        this.signer = signer;
        this.apiService = apiService;
    }

    async connect() {
        const ethAdapter = new EthersAdapter({
            ethers,
            signerOrProvider: this.signer,
        });

        this.safeSdk = await Safe.create({ ethAdapter: ethAdapter, safeAddress: this.address })
        this.safeService = new SafeApiKit({ txServiceUrl: this.apiService, ethAdapter })
    }

    private isTransactionSignedByAddress(tx: SafeMultisigTransactionResponse): boolean {
        const confirmation = tx.confirmations.find(
            (confirmation) => confirmation.owner === this.signer.address
        )
        return !!confirmation
    }

    async proposeTransaction(address: string, data: string, value: string = '0'): Promise<TransactionPropose> {
        this.safeSdk ?? await this.connect();
        const safeTransactionData: SafeTransactionDataPartial = {
            to: address,
            value,
            data
        };
        const tx = await this.safeSdk.createTransaction({ safeTransactionData });
        const safeTxHash = await this.safeSdk.getTransactionHash(tx);
        try {
            const transaction = await this.safeService.getTransaction(safeTxHash);
            var signatures = '0x';
            const signatureEnough = transaction.confirmations.length >= transaction.confirmationsRequired;
            if (signatureEnough) {
                for (const confirmation of transaction.confirmations) {
                    signatures += confirmation.signature.substring(2);
                }
            }
            const hasBeenSigned = this.isTransactionSignedByAddress(transaction);
            if (hasBeenSigned || signatureEnough) {
                //const isValidTx = await this.safeSdk.isValidTransaction(transaction);
                return {
                    //readyExecute: signatureEnough && isValidTx,
                    readyExecute: signatureEnough,
                    safeTxHash: safeTxHash,
                    txData: transaction.data,
                    to: address,
                    signatures,
                }
            }
        } catch(e) {}
        const senderSignature = await this.safeSdk.signTransactionHash(safeTxHash)
        const proposeTransactionProps = {
            safeAddress: this.address,
            safeTransactionData: tx.data,
            safeTxHash,
            senderAddress: this.signer.address,
            senderSignature: senderSignature.data,
        };
        await this.safeService.proposeTransaction(proposeTransactionProps);
        return {
            readyExecute: false,
            safeTxHash: safeTxHash,
            txData: '',
            to: address,
            signatures: '',
        };
    }
}
