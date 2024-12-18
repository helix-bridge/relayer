import { Logger } from "@nestjs/common";
import {
  MetaTransactionData,
  SafeTransaction,
} from "@safe-global/safe-core-sdk-types";
import Safe, { buildSignatureBytes, EthSafeSignature } from "@safe-global/protocol-kit";
import { ethers, Wallet, HDNodeWallet } from "ethers";
import { SafeService } from "./safe-service/safe.service";
import { EthereumConnectedWallet } from "./wallet";

export interface TransactionPropose {
  readyExecute: boolean;
  signedTransaction: SafeTransaction;
}

export class SafeWallet {
  public address: string;
  public wallet: EthereumConnectedWallet;
  public threshold: number;
  private safeSdk: Safe;
  private safeService: SafeService;
  private readonly logger = new Logger("safewallet");

  constructor(
    address: string,
    wallet: EthereumConnectedWallet,
    safeService: SafeService
  ) {
    this.address = address;
    this.wallet = wallet;
    this.safeService = safeService;

    wallet.registerUrlUpdateHandler(() => {
      this.safeSdk = undefined;
    });
  }

  async connect(chainId: bigint) {
    this.safeSdk = await Safe.init({
      provider: this.wallet.url(),
      signer: this.wallet.privateKey,
      safeAddress: this.address,
    });
    this.threshold = await this.safeSdk.getThreshold();
  }

  async proposeTransaction(
    transactions: MetaTransactionData[],
    isExecuter: boolean,
    chainId: bigint
  ): Promise<TransactionPropose | null> {
    this.safeSdk ?? (await this.connect(chainId));
    const tx = await this.safeSdk.createTransaction({ transactions });
    const txHash = await this.safeSdk.getTransactionHash(tx);

    if (this.threshold === 1) {
      if (isExecuter) {
        const signedTransaction = await this.safeSdk.signTransaction(tx);
        return {
          readyExecute: true,
          signedTransaction: signedTransaction,
        };
      } else {
        return null;
      }
    } else {
      const signedTransaction = await this.safeSdk.signTransaction(tx);
      const readyExecute = signedTransaction.signatures.size >= this.threshold;
      if (signedTransaction.signatures.size < this.threshold) {
        try {
          const senderSignature = await this.safeSdk.signHash(txHash)
          await this.safeService.proposeTransaction({
            safeAddress: this.address,
            safeTransactionData: tx.data,
            safeTxHash: txHash,
            senderAddress: this.wallet.address,
            senderSignature: senderSignature.data,
          });
          this.logger.log(
            `finish to propose transaction ${txHash} using ${this.safeService.name} on chain ${chainId}`
          );
        } catch (err) {
          this.logger.warn(
            `propose transaction ${txHash} using ${this.safeService.name} on chain ${chainId} failed, err ${err}`
          );
        }
      }
      return {
        readyExecute: readyExecute,
        signedTransaction: signedTransaction
      };
    }
  }
}
