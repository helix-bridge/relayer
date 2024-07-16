import { Wallet, HDNodeWallet } from "ethers";
import { EthereumProvider } from "./provider";
import { SafeMultisigConfirmationResponse, SafeMultisigTransactionResponse } from "@safe-global/safe-core-sdk-types";

enum PrivateKeyType {
  PRIVATE_KEY,
  MNEMONIC,
}

export class EthereumWallet {
  private wallet: Wallet | HDNodeWallet;
  constructor(keyType: PrivateKeyType, privateKey: string) {
    if (keyType === PrivateKeyType.PRIVATE_KEY) {
      this.wallet = new Wallet(privateKey);
    } else {
      this.wallet = Wallet.fromPhrase(privateKey);
    }
  }

  get Signer(): Wallet | HDNodeWallet {
    return this.wallet;
  }
}

export class EthereumConnectedWallet {
  public wallet: Wallet | HDNodeWallet;
  constructor(privateKey: string, provider: EthereumProvider) {
    this.wallet = new Wallet(privateKey, provider.provider);
  }

  get address() {
    return this.wallet.address;
  }
}

export function isTransactionSignedByAddress(
  tx: SafeMultisigTransactionResponse
): boolean {
  const confirmation = tx.confirmations.find(
    (confirmation) => confirmation.owner === this.signer.address
  );
  return !!confirmation;
}

export function concatSignatures(tx: SafeMultisigTransactionResponse): string | null {
  if (tx.confirmations.length < tx.confirmationsRequired) {
    return null;
  }
  // must sort by address
  tx.confirmations.sort(
    (
      left: SafeMultisigConfirmationResponse,
      right: SafeMultisigConfirmationResponse
    ) => {
      const leftAddress = left.owner.toUpperCase();
      const rightAddress = right.owner.toUpperCase();
      if (leftAddress < rightAddress) {
        return -1;
      } else {
        return 1;
      }
    }
  );
  var signatures = "0x";
  for (const confirmation of tx.confirmations) {
    signatures += confirmation.signature.substring(2);
  }
  return signatures;
}
