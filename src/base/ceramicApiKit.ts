import { SafeMultisigTransactionResponse } from "@safe-global/safe-core-sdk-types";
import { ProposeTransactionProps } from "@safe-global/api-kit/dist/src/types/safeTransactionServiceTypes";
import { definition } from "./ceramicModels";

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
                        clientMutationId: "${(new Date()).toISOString()}"
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
                      fee: " "
                      data: "${safeTransactionData.data}"
                      safe: "${safeAddress}"
                      nonce: 1
                      value: "${safeTransactionData.value}"
                      origin: "${origin}"
                      baseGas: 1
                      gasUsed: 1
                      trusted: true
                      executor: " "
                      gasPrice: " "
                      gasToken: " "
                      modified: " "
                      proposer: "${senderAddress}"
                      operation: 0
                      safeTxGas: 1
                      isExecuted: false
                      safeTxHash: "${safeTxHash}"
                      signatures: "${senderSignature}"
                      blockNumber: 1
                      dataDecoded: " "
                      ethGasPrice: " "
                      isSuccessful: false
                      executionDate: "0000-00-00T00:00:0.000Z"
                      refundReceiver: " "
                      submissionDate: "${(new Date()).toISOString()}"
                      transactionHash: "${safeTxHash}"
                      confirmationsRequired: ${threshold}
                  }
                  clientMutationId: "${(new Date()).toISOString()}"
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
                          fee
                          data
                          safe
                          nonce
                          value
                          origin
                          baseGas
                          gasUsed
                          trusted
                          executor
                          gasPrice
                          gasToken
                          modified
                          proposer
                          operation
                          safeTxGas
                          isExecuted
                          safeTxHash
                          signatures
                          blockNumber
                          dataDecoded
                          ethGasPrice
                          isSuccessful
                          executionDate
                          refundReceiver
                          submissionDate
                          transactionHash
                          confirmationsRequired
                      }
                  }
              }
          }
        `);

      const confirmationsIndex = await this.composeClient.executeQuery(`
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
        `);
      // @ts-ignore
      const confirmations = confirmationsIndex.data.confirmationIndex.edges.map((edge) => edge.node);
      return {
        // @ts-ignore
        ...transactionIndex.data.transactionIndex.edges[0].node,
        confirmations
      } as SafeMultisigTransactionResponse;
    } catch (error) {
      // console.error('Error fetching transaction:', error);
    }
  }
}
