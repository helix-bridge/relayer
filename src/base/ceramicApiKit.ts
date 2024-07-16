import { SafeMultisigTransactionResponse } from "@safe-global/safe-core-sdk-types";
import { ProposeTransactionProps } from "@safe-global/api-kit/dist/src/types/safeTransactionServiceTypes";
import { definition } from "./ceramicModels";

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
  data:{
    confirmationIndex: {
      edges: ConfirmationEdge[];
    };
  }
}

export class ceramicApiKit {
  private composeClient: any;
  private privateKey: string;
  private ceramicUrl: string;

  constructor(privateKey: string, ceramicUrl: string) {
    this.privateKey = privateKey;
    this.ceramicUrl = ceramicUrl;
  }

  async connect() {
    try {
      const { ComposeClient } = await import('@composedb/client');
      const composeClient = new ComposeClient({
        ceramic: this.ceramicUrl,
        //cannot import type from ESM only module in nest.js
        // @ts-ignore
        definition: definition,
      });
      const { fromString } = await import('uint8arrays/from-string');
      const seedArray = fromString(this.privateKey, "base16");
      const { Ed25519Provider } = await import('key-did-provider-ed25519');
      const provider = new Ed25519Provider(new Uint8Array(seedArray));
      const { DID } = await import('dids');
      const { getResolver } = await import('key-did-resolver');
      const did = new DID({ provider, resolver: getResolver() });
      await did.authenticate();
      composeClient.setDID(did);
      this.composeClient = composeClient;
    } catch (error) {
      console.error('Error on connecting to Ceramic:', error);
      throw error;
    }
  }

  async proposeTransaction({
                             safeAddress,
                             safeTransactionData,
                             safeTxHash,
                             senderAddress,
                             senderSignature,
                             origin
                           }: ProposeTransactionProps, threshold: number): Promise<void> {
    if (!this.composeClient) {
      await this.connect();
    }
    const confirmation = await this.composeClient.executeQuery(`
            mutation CreateConfirmation {
                createConfirmation(
                    input: {
                        content: {
                            owner: "${senderAddress}"
                            signature: "${senderSignature}"
                            signatureType: "ECDSA"
                            submissionDate: "${(new Date()).toISOString()}"
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

    const transaction = await this.composeClient.executeQuery(`mutation CreateTransaction {
          createTransaction(
              input: {
                  content: {
                      to: "${safeTransactionData.to}"
                      data: "${safeTransactionData.data}"
                      safe: "${safeAddress}"
                      nonce: 1
                      value: "${safeTransactionData.value}"
                      proposer: "${senderAddress}"
                      operation: 0
                      safeTxHash: "${safeTxHash}"
                      signatures: "${senderSignature}"
                      submissionDate: "${(new Date()).toISOString()}"
                      transactionHash: "${safeTxHash}"
                      confirmationsRequired: ${threshold}
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

  async getTransaction(safeTxHash: string): Promise<SafeMultisigTransactionResponse> {

    try {
      if (!this.composeClient) {
        await this.connect();
      }
      const transactionIndex = await this.composeClient.executeQuery(`
          query TransactionIndex {
              transactionIndex(
                  first: 1
                  filters: { where: { safeTxHash: { equalTo: "${safeTxHash}" } } }
              ) {
                  edges {
                      cursor
                      node {
                          id
                          to
                          data
                          safe
                          nonce
                          value
                          proposer
                          operation
                          safeTxHash
                          signatures
                          submissionDate
                          transactionHash
                          confirmationsRequired
                      }
                  }
              }
          }
        `);

      const confirmationsIndex: ConfirmationIndexData = await this.composeClient.executeQuery(`
            query ConfirmationIndex {
                confirmationIndex(
                    first: 10
                    filters: { where: { transactionHash: { equalTo: "${safeTxHash}" } } }
                ) {
                    edges {
                        node {
                            owner
                            id
                            signature
                            signatureType
                            submissionDate
                            transactionHash
                            confirmationType
                        }
                    }
                }
            }
        `) as ConfirmationIndexData;
      const confirmations = confirmationsIndex.data.confirmationIndex.edges.map((edge) => edge.node);
      return {
        ...transactionIndex.data.transactionIndex.edges[0].node,
        confirmations
      } as SafeMultisigTransactionResponse;
    } catch (error) {
      // console.error('Error fetching transaction:', error);
    }
  }
}
