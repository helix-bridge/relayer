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

export interface SignatureInfo {
  size: number;
  signatures: string;
  selfSigned: boolean;
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
      selfSigned: uniqueOwners.includes(this.signer.address.toLowerCase()),
    };
  }

  async proposeTransaction(
    transactions: MetaTransactionData[],
    isExecuter: boolean,
    chainId: bigint
  ): Promise<TransactionPropose | null> {
    this.safeSdk ?? (await this.connect(chainId));
    const tx = await this.safeSdk.createTransaction({ transactions });
    const safeTxHash = await this.safeSdk.getTransactionHash(tx);

    const propose = {
      safeTxHash: safeTxHash,
      txData: tx.data.data,
      to: tx.data.to,
      value: BigInt(tx.data.value),
      operation: tx.data.operation,
    };

    if (this.threshold === 1) {
      if (isExecuter) {
        const signature = await this.safeSdk.signTransactionHash(safeTxHash);
        return {
          ...propose,
          readyExecute: true,
          signatures: signature.data,
        };
      } else {
        return null;
      }
    } else {
      let confirmations: SafeMultisigConfirmationResponse[];
      try {
        confirmations = await this.safeService.getTransactionConfirmations(
          safeTxHash
        );
      } catch {
        confirmations = [];
      }
      var signatureInfo: SignatureInfo = this.concatSignatures(confirmations);
      if (signatureInfo.selfSigned) {
        return {
          ...propose,
          readyExecute: signatureInfo.size >= this.threshold,
          signatures: signatureInfo.signatures,
        };
      } else {
        const signature = await this.safeSdk.signTransactionHash(safeTxHash);
        if (!isExecuter) {
          if (signatureInfo.size < this.threshold) {
            const proposeTransactionProps = {
              safeAddress: this.address,
              safeTransactionData: tx.data,
              safeTxHash,
              senderAddress: this.signer.address,
              senderSignature: signature.data,
            };
            try {
              await this.safeService.proposeTransaction(
                proposeTransactionProps
              );
              this.logger.log(
                `finish to propose transaction ${safeTxHash} using ${this.safeService.name} on chain ${chainId}`
              );
            } catch (err) {
              this.logger.warn(
                `propose transaction ${safeTxHash} using ${this.safeService.name} on chain ${chainId} failed, err ${err}`
              );
            }
          }
          return {
            ...propose,
            readyExecute: signatureInfo.size >= this.threshold,
            signatures: signatureInfo.signatures,
          };
        } else {
          const readyExecute = signatureInfo.size + 1 >= this.threshold;
          this.logger.log(
            `${
              readyExecute ? "ready" : "waiting"
            } to execute, tx ${safeTxHash} on chain ${chainId}`
          );
          return {
            ...propose,
            readyExecute: readyExecute,
            signatures: signatureInfo.signatures + signature.data.substring(2),
          };
        }
      }
    }
  }
}
