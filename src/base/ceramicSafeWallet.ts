import { MetaTransactionData, SafeMultisigTransactionResponse } from "@safe-global/safe-core-sdk-types";
import Safe from "@safe-global/protocol-kit";
import { Wallet, HDNodeWallet } from "ethers";
import { ceramicApiKit } from "./ceramicApiKit";
import {
  concatSignatures,
  connectSafeWalletSDK,
  isTransactionSignedByAddress,
  SAFE_TRANSACTION_EMPTY,
  TransactionPropose
} from "./wallet";

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
    this.safeSdk = await connectSafeWalletSDK(this.address, this.signer);
  }

  async proposeTransaction(
    transactions: MetaTransactionData[],
    isProposor: boolean,
    chainId: bigint
  ): Promise<TransactionPropose | null> {
    this.safeSdk ?? (await this.connect(chainId));
    const safeTransaction = await this.safeSdk.createTransaction({ transactions });
    const [safeTxHash, owners, threshold] = await Promise.all([
      this.safeSdk.getTransactionHash(safeTransaction),
      this.safeSdk.getOwners(),
      this.safeSdk.getThreshold(),
    ]);
    const uniqueOwners = new Set();
    try {
      const confirmations = await this.ceramicService.getTransactionioConfirmations(safeTxHash);
      const filteredConfirmations = confirmations.filter(confirmation => {
        if (!owners.includes(confirmation.owner)) return false;
        if (uniqueOwners.has(confirmation.owner)) return false;
        uniqueOwners.add(confirmation.owner);
        return true;
      });
      var signatures = concatSignatures({
        confirmationsRequired: threshold,
        confirmations: filteredConfirmations
      } as SafeMultisigTransactionResponse);
      const hasBeenSigned = isTransactionSignedByAddress(confirmations, this.signer.address);
      if (hasBeenSigned || signatures !== null) {
        //const isValidTx = await this.safeSdk.isValidTransaction(transaction);
        return {
          //readyExecute: signatureEnough && isValidTx,
          readyExecute: signatures !== null,
          safeTxHash: safeTxHash,
          txData: safeTransaction.data.data,
          to: safeTransaction.data.to,
          value: BigInt(safeTransaction.data.value),
          operation: safeTransaction.data.operation,
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
      safeTransactionData: safeTransaction.data,
      safeTxHash,
      senderAddress: this.signer.address,
      senderSignature: senderSignature.data,
    };

    await this.ceramicService.proposeTransaction(proposeTransactionProps, threshold);

    return {
      ...SAFE_TRANSACTION_EMPTY,
      safeTxHash: safeTxHash,
    };
  }
}
