import {
  MetaTransactionData,
} from "@safe-global/safe-core-sdk-types";
import Safe, { EthersAdapter } from "@safe-global/protocol-kit";
import SafeApiKit from "@safe-global/api-kit";
import { ethers, Wallet, HDNodeWallet } from "ethers";
import { concatSignatures, isTransactionSignedByAddress, SAFE_TRANSACTION_EMPTY, TransactionPropose } from "./wallet";

type Opts = {
  allowedDomains?: RegExp[];
  debug?: boolean;
};

export interface ProposalCalls {
  address: string;
  data: string;
  value: bigint;
}

export class SafeWallet {
  public address: string;
  public apiService: string;
  public signer: Wallet | HDNodeWallet;
  private safeSdk: Safe;
  private safeService: SafeApiKit;

  constructor(
    address: string,
    apiService: string,
    signer: Wallet | HDNodeWallet
  ) {
    this.address = address;
    this.signer = signer;
    this.apiService = apiService;
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
    this.safeService = new SafeApiKit({
      txServiceUrl: this.apiService,
      chainId,
    });
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
      const transaction = await this.safeService.getTransaction(safeTxHash);
      var signatures = concatSignatures(transaction);
      const hasBeenSigned = isTransactionSignedByAddress(transaction.confirmations, this.signer.address);
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
    await this.safeService.proposeTransaction(proposeTransactionProps);
    return {
      ...SAFE_TRANSACTION_EMPTY,
      safeTxHash,
    };
  }
}
