import { SafeMultisigConfirmationResponse } from "@safe-global/safe-core-sdk-types";
import { ProposeTransactionProps } from "@safe-global/api-kit";
import { SafeService } from "./safe.service";
import { ethers } from "ethers";
import axios from "axios";

export class ApolloService extends SafeService {
  private chainId: number;
  private privateKey: string;

  constructor(chainId: number, apolloUrl: string) {
    super("apollo", apolloUrl);
    this.chainId = chainId;
  }

  async proposeTransaction({
    safeAddress,
    safeTransactionData,
    safeTxHash,
    senderAddress,
    senderSignature,
    origin,
  }: ProposeTransactionProps): Promise<void> {
    const mutation = `mutation {
      proposeSafeTransaction(
        owner: "${senderAddress}",
        safeAddress: "${safeAddress}",
        chainId: ${this.chainId},
        signature: "${senderSignature}",
        signatureType: "ECDSA",
        transactionHash: "${safeTxHash}",
        nonce: ${safeTransactionData.nonce},
        confirmationType: "approve"
      )}`;
    await axios.post(this.url, {
      query: mutation,
      variables: null,
    });
  }

  async getTransactionConfirmations(
    safeTxHash: string
  ): Promise<SafeMultisigConfirmationResponse[]> {
    const query = `{
      getTransactionConfirmations(
        safeTxHash: \"${safeTxHash}\"
      ) {
        owner, signature, signatureType, transactionHash, confirmationType
      }
    }`;
    const confirmations = await axios
      .post(this.url, {
        query,
        variables: {},
        operationName: null,
      })
      .then((res) => res.data.data.getTransactionConfirmations);

    const validConfirmations = confirmations.filter((confirmation) => {
      const { signature } = confirmation;
      let signatureV: number = parseInt(signature.slice(-2), 16);
      if (signatureV !== 31 && signatureV !== 32) {
        return false;
      }
      signatureV -= 4;
      const normalizedSignature =
        signature.slice(0, -2) + signatureV.toString(16);
      return (
        ethers
          .verifyMessage(ethers.getBytes(safeTxHash), normalizedSignature)
          .toLowerCase() === confirmation.owner.toLowerCase()
      );
    });
    return validConfirmations;
  }
}
