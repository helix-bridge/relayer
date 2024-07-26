import { Logger } from "@nestjs/common";
import {
  MetaTransactionData,
  SafeMultisigConfirmationResponse,
} from "@safe-global/safe-core-sdk-types";
import Safe, { EthersAdapter } from "@safe-global/protocol-kit";
import SafeApiKit from "@safe-global/api-kit";
import { ethers, Wallet, HDNodeWallet } from "ethers";
import { SafeService } from "./safe-service/safe.service";

export interface TransactionPropose {
  to: string;
  value: bigint;
  readyExecute: boolean;
  safeTxHash: string;
  txData: string;
  operation: number;
  signatures: string | null;
}

export class SafeWallet {
  public address: string;
  public signer: Wallet | HDNodeWallet;
  public owners: string[];
  public threshold: number;
  private safeSdk: Safe;
  private safeService: SafeService;
  private readonly logger = new Logger("safewallet");

  constructor(
    address: string,
    signer: Wallet | HDNodeWallet,
    safeService: SafeService
  ) {
    this.address = address;
    this.signer = signer;
    this.safeService = safeService;
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
    this.owners = await this.safeSdk.getOwners();
    this.threshold = await this.safeSdk.getThreshold();
  }

  private concatSignatures(
    confirmations: SafeMultisigConfirmationResponse[]
  ): string | null {
    if (confirmations.length < this.threshold) {
      return null;
    }
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
        uniqueOwners.includes(confirmation.owner) ||
        !this.owners.includes(confirmation.owner)
      ) {
        continue;
      }
      uniqueOwners.push(confirmation.owner);
    }
    if (uniqueOwners.length < this.threshold) {
      return null;
    }
    return signatures;
  }

  private isTransactionSignedByAddress(
    confirmations: SafeMultisigConfirmationResponse[]
  ): boolean {
    const confirmation = confirmations.find(
      (confirmation) => confirmation.owner === this.signer.address
    );
    return !!confirmation;
  }

  async proposeTransaction(
    transactions: MetaTransactionData[],
    isProposor: boolean,
    chainId: bigint
  ): Promise<TransactionPropose | null> {
    this.safeSdk ?? (await this.connect(chainId));
    const tx = await this.safeSdk.createTransaction({ transactions });
    const safeTxHash = await this.safeSdk.getTransactionHash(tx);
    try {
      const confirmations = await this.safeService.getTransactionConfirmations(
        safeTxHash
      );
      var signatures = this.concatSignatures(confirmations);
      const hasBeenSigned = this.isTransactionSignedByAddress(confirmations);
      if (hasBeenSigned || signatures !== null) {
        return {
          readyExecute: signatures !== null,
          safeTxHash: safeTxHash,
          txData: tx.data.data,
          to: tx.data.to,
          value: BigInt(tx.data.value),
          operation: tx.data.operation,
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
    await this.safeService.proposeTransaction(proposeTransactionProps);
    this.logger.log(
      `finish to propose transaction ${safeTxHash} using ${this.safeService.name} on chain ${chainId}`
    );
    return {
      readyExecute: false,
      safeTxHash: "",
      txData: "",
      to: "",
      value: BigInt(0),
      operation: 0,
      signatures: "",
    };
  }
}
