import { Wallet } from "ethers";
import { EthereumProvider } from "./provider";

enum PrivateKeyType {
  PRIVATE_KEY,
  MNEMONIC,
}

export class EthereumWallet {
  private wallet: Wallet;
  constructor(keyType: PrivateKeyType, privateKey: string) {
    if (keyType === PrivateKeyType.PRIVATE_KEY) {
      this.wallet = new Wallet(privateKey);
    } else {
      this.wallet = Wallet.fromMnemonic(privateKey);
    }
  }

  get Signer(): Wallet {
    return this.wallet;
  }
}

export class EthereumConnectedWallet {
  public wallet: Wallet;
  constructor(privateKey: string, provider: EthereumProvider) {
    this.wallet = new Wallet(privateKey, provider.provider);
  }

  get address() {
    return this.wallet.address;
  }
}
