import { Logger } from "@nestjs/common";
import {
  MetaTransactionData,
  SafeTransaction,
  SafeMultisigConfirmationResponse,
} from "@safe-global/safe-core-sdk-types";
import Safe, { buildSignatureBytes, EthSafeSignature } from "@safe-global/protocol-kit";
import { ethers, Wallet, HDNodeWallet } from "ethers";
import { SafeService } from "./safe-service/safe.service";
import { EthereumConnectedWallet } from "./wallet";

export interface TransactionPropose {
  readyExecute: boolean;
  safeTransaction: SafeTransaction;
  signatures: string | null;
}

export interface SignatureInfo {
  size: number;
  signatures: string;
  selfSigned: boolean;
}

export class SafeWallet {
  public address: string;
  public wallet: EthereumConnectedWallet;
  public owners: string[];
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
    this.owners = (await this.safeSdk.getOwners()).map((o) => o.toLowerCase());
    this.threshold = await this.safeSdk.getThreshold();
  }

  private concatSignatures(
    confirmations: SafeMultisigConfirmationResponse[]
  ): SignatureInfo {
    // must sort by address
    confirmations.sort(
      (
        left: SafeMultisigConfirmationResponse,
        right: SafeMultisigConfirmationResponse
      ) => {
        const leftAddress = left.owner.toLowerCase();
        const rightAddress = right.owner.toLowerCase();
        if (leftAddress < rightAddress) {
          return -1;
        } else {
          return 1;
        }
      }
    );
    var signatures = "0x";
    const uniqueOwners = [];
    for (const confirmation of confirmations) {
      signatures += confirmation.signature.substring(2);
      if (
        uniqueOwners.includes(confirmation.owner.toLowerCase()) ||
        !this.owners.includes(confirmation.owner.toLowerCase())
      ) {
        continue;
      }
      uniqueOwners.push(confirmation.owner.toLowerCase());
    }
    return {
      size: uniqueOwners.length,
      signatures: signatures,
      selfSigned: uniqueOwners.includes(
        this.wallet.wallet.address.toLowerCase()
      ),
    };
  }

  async proposeTransaction(
    transactions: MetaTransactionData[],
    isExecuter: boolean,
    chainId: bigint
  ): Promise<TransactionPropose | null> {
    this.safeSdk ?? (await this.connect(chainId));
    const tx = await this.safeSdk.createTransaction({ transactions });
    const txHash = await this.safeSdk.getTransactionHash(tx);
    let readyExecute: boolean = false;

    if (this.threshold === 1) {
      if (isExecuter) {
        const signedTransaction = await this.safeSdk.signTransaction(tx);
        return {
          readyExecute: true,
          safeTransaction: tx,
          signatures: signedTransaction.encodedSignatures()
        };
      } else {
        return null;
      }
    } else {
      let confirmations: SafeMultisigConfirmationResponse[];
      try {
        confirmations = await this.safeService.getTransactionConfirmations(
         txHash 
        );
      } catch {
        confirmations = [];
      }

      var signatureInfo: SignatureInfo = this.concatSignatures(confirmations);
      readyExecute = signatureInfo.size >= this.threshold;
      if (signatureInfo.selfSigned) {
        return {
          readyExecute: readyExecute,
          safeTransaction: tx,
          signatures: signatureInfo.signatures,
        };
      } else {
        if (signatureInfo.size < this.threshold) {
          try {
            const senderSignature = await this.safeSdk.signHash(txHash)
            await this.safeService.proposeTransaction({
              safeAddress: this.address,
              safeTransactionData: tx.data,
              safeTxHash: txHash,
              senderAddress: this.wallet.address,
              senderSignature: senderSignature.data,
            });
            signatureInfo.signatures += senderSignature.data.substring(2);
            readyExecute = signatureInfo.size + 1 >= this.threshold;
            this.logger.log(
              `finish to propose transaction ${txHash} using ${this.safeService.name} on chain ${chainId}`
            );
          } catch (err) {
            this.logger.warn(
              `propose transaction ${txHash} using ${this.safeService.name} on chain ${chainId} failed, err ${err}`
            );
          }
        }
      }
      if (!isExecuter) {
        return {
          readyExecute: false,
          safeTransaction: tx,
          signatures: signatureInfo.signatures
        }
      }
      // isExecuter
      return {
        readyExecute: readyExecute,
        safeTransaction: tx,
        signatures: signatureInfo.signatures
      };
    }
  }
}
