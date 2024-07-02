import { ComposeClient } from "@composedb/client";
import { SafeMultisigTransactionResponse } from "@safe-global/safe-core-sdk-types";

export class ceramicApiKit {
  private composeClient: ComposeClient;

  constructor(ceramic, composeClient) {
    this.composeClient = composeClient;
  }

  async proposeTransaction({
                             safeAddress,
                             safeTransactionData,
                             safeTxHash,
                             senderAddress,
                             senderSignature,
                             origin
                           }): Promise<void> {
    //TODO： validation for availability, if there's already a transaction with the same safeTxHash, throw error
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
                      data: "0x"
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
                      operation: 1
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
                      confirmationsRequired: 2
                  }
                  clientMutationId: "${(new Date()).toISOString()}"
              }
          ) {
              clientMutationId
          }
      }
    `);

    console.log(`sending confirmation:`, confirmation);
    console.log(`sending transaction:`, transaction);

    return Promise.resolve();
  }

  async getTransaction(safeTxHash: string): Promise<SafeMultisigTransactionResponse> {
    console.log(`fetching by safeTxHash:`, safeTxHash);

    try {
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
      console.error('Error fetching transaction:', error);
    }
  }
}
