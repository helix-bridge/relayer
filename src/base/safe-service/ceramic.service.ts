import { SafeMultisigConfirmationResponse } from "@safe-global/safe-core-sdk-types";
import { ProposeTransactionProps } from "@safe-global/api-kit";
import { SafeService } from "./safe.service";
import { definition } from "./ceramic.models";
import { ethers } from "ethers";

interface ConfirmationNode {
  owner: string;
  id: string;
  signature: string;
  signatureType: string;
  submissionDate: string;
  transactionHash: string;
  confirmationType: string;
}

interface ConfirmationEdge {
  node: ConfirmationNode;
}

interface ConfirmationIndexData {
  data: {
    confirmationIndex: {
      edges: ConfirmationEdge[];
    };
  };
}

export class CeramicService extends SafeService {
  private composeClient: any;
  private privateKey: string;

  constructor(privateKey: string, ceramicUrl: string) {
    super("ceramic", ceramicUrl);
    this.privateKey = privateKey;
  }

  async init() {
    try {
      const { ComposeClient } = await import("@composedb/client");
      const composeClient = new ComposeClient({
        ceramic: this.url,
        //cannot import type from ESM only module in nest.js
        // @ts-ignore
        definition: definition,
      });
      const { fromString } = await import("uint8arrays/from-string");
      const seedArray = fromString(this.privateKey, "base16");
      const { Ed25519Provider } = await import("key-did-provider-ed25519");
      const provider = new Ed25519Provider(new Uint8Array(seedArray));
      const { DID } = await import("dids");
      const { getResolver } = await import("key-did-resolver");
      const did = new DID({ provider, resolver: getResolver() });
      await did.authenticate();
      composeClient.setDID(did);
      this.composeClient = composeClient;
    } catch (error) {
      console.error("Error on connecting to Ceramic:", error);
      throw error;
    }
  }

  async proposeTransaction({
    safeAddress,
    safeTransactionData,
    safeTxHash,
    senderAddress,
    senderSignature,
    origin,
  }: ProposeTransactionProps): Promise<void> {
    if (!this.composeClient) {
      await this.init();
    }
    const confirmation = await this.composeClient.executeQuery(`
        mutation CreateConfirmation {
            createConfirmation(
                input: {
                    content: {
                        owner: "${senderAddress}"
                        signature: "${senderSignature}"
                        signatureType: "ECDSA"
                        submissionDate: "${new Date().toISOString()}"
                        transactionHash: "${safeTxHash}"
                        confirmationType: "approve"
                    }
                    clientMutationId: null
                }
            ) {
                clientMutationId
            }
        }
    `);

    return Promise.resolve();
  }
}
