import { SafeMultisigConfirmationResponse } from "@safe-global/safe-core-sdk-types";
import { ProposeTransactionProps } from '@safe-global/api-kit';

export abstract class SafeService {
  public name: string;
  public url: string;
  constructor(name: string, url: string) {
    this.name = name;
    this.url = url;
  }
  abstract getTransactionConfirmations(safeTxHash: string): Promise<SafeMultisigConfirmationResponse[]>;
  abstract proposeTransaction(prop: ProposeTransactionProps): Promise<void>;
}
 
