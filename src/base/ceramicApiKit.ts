import { ComposeClient } from "@composedb/client";
import { SafeMultisigTransactionResponse } from "@safe-global/safe-core-sdk-types";
import { ProposeTransactionProps } from "@safe-global/api-kit/dist/src/types/safeTransactionServiceTypes";
import { definition } from "./ceramicModels";
import { RuntimeCompositeDefinition } from "@composedb/types";

export async function getComposeClient() {
  const module = await (eval(`import('@composedb/client')`) as Promise<typeof import('@composedb/client')>);
  return module.ComposeClient;
}

export async function getEd25519Provider() {
  const module = await (eval(`import('key-did-provider-ed25519')`) as Promise<typeof import('key-did-provider-ed25519')>);
  return module.Ed25519Provider;
}

export async function getDID() {
  const module = await (eval(`import('dids')`) as Promise<typeof import('dids')>);
  return module.DID;
}

export async function getGetResolver() {
  const module = await (eval(`import('key-did-resolver')`) as Promise<typeof import('key-did-resolver')>);
  return module.getResolver;
}

export async function getFromString() {
  const module = await (eval(`import('uint8arrays/from-string')`) as Promise<typeof import('uint8arrays/from-string')>);
  return module.fromString;
}


export class ceramicApiKit {
  private composeClient: ComposeClient;
  private privateKey: string;
  private ceramicUrl: string;

  constructor(privateKey: string, ceramicUrl: string) {
    this.privateKey = privateKey;
    this.ceramicUrl = ceramicUrl;
  }

  async connect() {
    const ComposeClient = await getComposeClient();
    const composeClient = new ComposeClient({
      ceramic: this.ceramicUrl,
      definition: definition as RuntimeCompositeDefinition,
    });
    const fromString = await getFromString();
    const seedArray = fromString(this.privateKey, "base16");
    const Ed25519Provider = await getEd25519Provider();
    const provider = new Ed25519Provider(new Uint8Array(seedArray));
    const DID = await getDID();
    const getResolver = await getGetResolver();
    const did = new DID({ provider, resolver: getResolver() });
    await did.authenticate();
    composeClient.setDID(did);
    this.composeClient = composeClient;
  }

  async proposeTransaction({
                             safeAddress,
                             safeTransactionData,
                             safeTxHash,
                             senderAddress,
                             senderSignature,
                             origin
                           }: ProposeTransactionProps, threshold: number): Promise<void> {
    //TODO： validation for availability, if there's already a transaction with the same safeTxHash, throw error
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

    console.log(`safeTransactionData.data`, safeTransactionData.data)
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

    // console.log(`sending confirmation:`, confirmation);
    // console.log(`sending transaction:`, transaction);

    return Promise.resolve();
  }

  async getTransaction(safeTxHash: string): Promise<SafeMultisigTransactionResponse> {
    // console.log(`fetching by safeTxHash:`, safeTxHash);

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
      console.error('Error fetching transaction:', error);
    }
  }
}
