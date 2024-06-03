import axios from "axios";
import { Wallet, HDNodeWallet, ethers, AbiCoder } from "ethers";
import { EthereumContract } from "./contract";
import { layerzeroMessager } from "../abi/layerzeroMessager";
import { msgportMessager } from "../abi/msgportMessager";

export interface MessageParams {
  fee: bigint;
  extParams: string;
}

// Each messager has a unique contract on a special chain
export abstract class Messager extends EthereumContract {
  abstract params(
      fromChainId: number,
      toChainId: number,
      remoteMessager: string,
      payload: string,
      refunder: string
  ): Promise<MessageParams>;
  abstract encodePayload(fromChainId: number, localAppAddress: string, remoteAppAddress: string, message: string): string;
}

export class MessagePortMessager extends Messager {
  private serviceUrl: string = "https://api.msgport.xyz/ormp/fee";

  constructor(
    address: string,
    signer: Wallet | HDNodeWallet | ethers.Provider
  ) {
    super(address, msgportMessager, signer);
  }

  encodePayload(fromChainId: number, localAppAddress: string, remoteAppAddress: string, message: string): string {
    return this.interface.encodeFunctionData("receiveMessage", [
        fromChainId,
        localAppAddress,
        remoteAppAddress,
        message
    ]);
  }

  async params(
      fromChainId: number,
      toChainId: number,
      remoteMessager: string,
      payload: string,
      refunder: string
  ): Promise<MessageParams> {
      const url = `${this.serviceUrl}?from_chain_id=${fromChainId}&to_chain_id=${toChainId}&payload=${payload}&from_address=${this.address}&to_address=${remoteMessager}&refund_address=${refunder}`;
      const resp = await axios.get(url).then((res) => res);
      return {
        fee: BigInt(resp.data.data.fee),
        extParams: resp.data.data.params,
      };
  }
}

export class LayerzeroMessager extends Messager {
  constructor(
    address: string,
    signer: Wallet | HDNodeWallet | ethers.Provider
  ) {
    super(address, layerzeroMessager, signer);
  }
  encodePayload(fromChainId: number, localAppAddress: string, remoteAppAddress: string, message: string): string {
    return AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "bytes"],
      [localAppAddress, remoteAppAddress, message]
    );
  }

  async params(
      fromChainId: number,
      toChainId: number,
      remoteMessager: string,
      payload: string,
      refunder: string
  ): Promise<MessageParams> {
    // here we only need to get the right size of the payload
    const fee = await this.contract.fee(toChainId, payload);
    return {
      fee: fee[0],
      extParams: refunder,
    }
  }
}

export function messagerInstance(
    channel: string,
    address: string,
    signer: Wallet | HDNodeWallet | ethers.Provider
): Messager {
    if (channel === 'layerzero') {
        return new LayerzeroMessager(address, signer);
    } else if (channel === 'msgline') {
        return new MessagePortMessager(address, signer);
    }
}

