import { SafeMultisigConfirmationResponse } from "@safe-global/safe-core-sdk-types";
import SafeApiKit, { ProposeTransactionProps } from "@safe-global/api-kit";
import { SafeService } from "./safe.service";

export class SafeGlobalService extends SafeService {
  private safeService: SafeApiKit;

  constructor(url: string, chainId: bigint) {
    super("safe.global", url);
    this.safeService = new SafeApiKit({
      txServiceUrl: url,
      chainId,
    });
  }

  async proposeTransaction(props: ProposeTransactionProps): Promise<void> {
    await this.safeService.proposeTransaction(props);
  }


  async getTransactionConfirmations(
    safeTxHash: string
  ): Promise<SafeMultisigConfirmationResponse[]> {
    const transaction = await this.safeService.getTransaction(safeTxHash);
    return transaction?.confirmations;
  }
}
