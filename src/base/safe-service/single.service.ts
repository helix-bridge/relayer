import { SafeMultisigConfirmationResponse } from "@safe-global/safe-core-sdk-types";
import { ProposeTransactionProps } from "@safe-global/api-kit";
import { SafeService } from "./safe.service";

export class SingleService extends SafeService {
  private props: ProposeTransactionProps;
  constructor() {
    super("single", "");
  }

  async proposeTransaction(props: ProposeTransactionProps): Promise<void> {
    this.props = props;
  }

  async getTransactionConfirmations(
    safeTxHash: string
  ): Promise<SafeMultisigConfirmationResponse[]> {
    if (safeTxHash !== this.props?.safeTxHash) {
      return [];
    }
    return [{
      owner: this.props.senderAddress,
      signature: this.props.senderSignature,
      signatureType: "ECDSA",
      transactionHash: safeTxHash,
      submissionDate: new Date().toISOString(),
      confirmationType: "approve"
    }];
  }
}
