import {
  SafeMultisigTransactionResponse,
  SafeMultisigConfirmationResponse,
  MetaTransactionData,
} from "@safe-global/safe-core-sdk-types";
import Safe, { EthersAdapter } from "@safe-global/protocol-kit";
import { ethers, Wallet, HDNodeWallet } from "ethers";
import { ceramicApiKit } from "./ceramicApiKit";

export interface TransactionPropose {
  to: string;
  value: bigint;
  readyExecute: boolean;
  safeTxHash: string;
  txData: string;
  operation: number;
  signatures: string | null;
}

export class CeramicSafeWallet {
  public address: string;
  public signer: Wallet | HDNodeWallet;
  private safeSdk: Safe;
  private ceramicService: ceramicApiKit;

  constructor(
    address: string,
    signer: Wallet | HDNodeWallet,
    ceramicService: ceramicApiKit
  ) {
    this.address = address;
    this.signer = signer;
    this.ceramicService = ceramicService;
  }

  async connect(chainId: bigint) {
    const ethAdapter = new EthersAdapter({
      ethers,
      signerOrProvider: this.signer,
    });

    this.safeSdk = await Safe.create({
      ethAdapter: ethAdapter,
      safeAddress: this.address,
    });
  }

  private isTransactionSignedByAddress(
    tx: SafeMultisigTransactionResponse
  ): boolean {
    const confirmation = tx.confirmations.find(
      (confirmation) => confirmation.owner === this.signer.address
    );
    return !!confirmation;
  }

  private concatSignatures(tx: SafeMultisigTransactionResponse): string | null {
    if (tx.confirmations.length < tx.confirmationsRequired) {
      return null;
    }
    // must sort by address
    tx.confirmations.sort(
      (
        left: SafeMultisigConfirmationResponse,
        right: SafeMultisigConfirmationResponse
      ) => {
        const leftAddress = left.owner.toUpperCase();
        const rightAddress = right.owner.toUpperCase();
        if (leftAddress < rightAddress) {
          return -1;
        } else {
          return 1;
        }
      }
    );
    var signatures = "0x";
    for (const confirmation of tx.confirmations) {
      signatures += confirmation.signature.substring(2);
    }
    return signatures;
  }

  async proposeTransaction(
    transactions: MetaTransactionData[],
    isProposor: boolean,
    chainId: bigint
  ): Promise<TransactionPropose | null> {
    this.safeSdk ?? (await this.connect(chainId));
    const tx = await this.safeSdk.createTransaction({ transactions });
    console.log(`wallet tx:`, tx);
    const safeTxHash = await this.safeSdk.getTransactionHash(tx);
    try {
      const transaction = await this.ceramicService.getTransaction(safeTxHash);
      var signatures = this.concatSignatures(transaction);
      const hasBeenSigned = this.isTransactionSignedByAddress(transaction);
      if (hasBeenSigned || signatures !== null) {
        //const isValidTx = await this.safeSdk.isValidTransaction(transaction);
        return {
          //readyExecute: signatureEnough && isValidTx,
          readyExecute: signatures !== null,
          safeTxHash: safeTxHash,
          txData: transaction.data,
          to: transaction.to,
          value: BigInt(transaction.value),
          operation: transaction.operation,
          signatures,
        };
      }
    } catch (e) {
      if (!isProposor) {
        return null;
      }
    }
    const senderSignature = await this.safeSdk.signTransactionHash(safeTxHash);
    const proposeTransactionProps = {
      safeAddress: this.address,
      safeTransactionData: tx.data,
      safeTxHash,
      senderAddress: this.signer.address,
      senderSignature: senderSignature.data,
    };
    const threshold = await this.safeSdk.getThreshold();
    await this.ceramicService.proposeTransaction(proposeTransactionProps, threshold);
    return {
      readyExecute: false,
      safeTxHash: safeTxHash,
      txData: "",
      to: "",
      value: BigInt(0),
      operation: 0,
      signatures: "",
    };
  }
}
