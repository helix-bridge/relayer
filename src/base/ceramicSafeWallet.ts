import { MetaTransactionData } from "@safe-global/safe-core-sdk-types";
import Safe, { EthersAdapter } from "@safe-global/protocol-kit";
import { ethers, Wallet, HDNodeWallet } from "ethers";
import { ceramicApiKit } from "./ceramicApiKit";
import { concatSignatures, isTransactionSignedByAddress } from "./wallet";

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

  async proposeTransaction(
    transactions: MetaTransactionData[],
    isProposor: boolean,
    chainId: bigint
  ): Promise<TransactionPropose | null> {
    this.safeSdk ?? (await this.connect(chainId));
    const nonce = await this.safeSdk.getNonce();
    const tx = await this.safeSdk.createTransaction({ transactions, options: { nonce } });
    const safeTxHash = await this.safeSdk.getTransactionHash(tx);
    const owners = await this.safeSdk.getOwners();
    const uniqueOwners = new Set();
    try {
      const transaction = await this.ceramicService.getTransaction(safeTxHash);
      const filteredConfirmations = transaction.confirmations.filter(confirmation => {
        if (!owners.includes(confirmation.owner)) return false;
        if (uniqueOwners.has(confirmation.owner)) return false;
        uniqueOwners.add(confirmation.owner);
        return true;
      });
      var signatures = concatSignatures({ ...transaction, confirmations: filteredConfirmations });
      const hasBeenSigned = isTransactionSignedByAddress(transaction);
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

    const [senderSignature, threshold] = await Promise.all([
      this.safeSdk.signTransactionHash(safeTxHash),
      this.safeSdk.getThreshold(),
    ]);

    const proposeTransactionProps = {
      safeAddress: this.address,
      safeTransactionData: tx.data,
      safeTxHash,
      senderAddress: this.signer.address,
      senderSignature: senderSignature.data,
    };

    await this.ceramicService.proposeTransaction(proposeTransactionProps, threshold, nonce);

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
