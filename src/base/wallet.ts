import { HDNodeWallet, Wallet, ethers } from "ethers";
import { EthereumProvider } from "./provider";

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
  public onProviderUpdatedHandlers: (() => void)[] = [];
  public tryNextUrl: () => void;
  public url: () => string;

  constructor(privateKey: string, provider: EthereumProvider) {
    this.wallet = new Wallet(privateKey, provider.provider);
    this.tryNextUrl = () => {
      provider.tryNextUrl();
    };
    this.url = () => {
      return provider.url;
    };
    provider.registerUrlUpdateHandler(() => {
      this.wallet = new Wallet(privateKey, provider.provider);
      for (const handler of this.onProviderUpdatedHandlers) {
        handler();
      }
    });
  }

  registerUrlUpdateHandler(handler: () => void) {
    this.onProviderUpdatedHandlers.push(handler);
  }

  get address() {
    return this.wallet.address;
  }

  get privateKey() {
    return this.wallet.privateKey;
  }

  get SignerOrProvider(): Wallet | HDNodeWallet | ethers.Provider {
    return this.wallet;
  }
}
