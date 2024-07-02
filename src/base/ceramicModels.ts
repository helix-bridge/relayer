export const definition = {
  "models": {
    "Confirmation": {
      "interface": false,
      "implements": [],
      "id": "kjzl6hvfrbw6c5gtolwtyepyhyt547e6qu8demply6fhtfviq9xt96vvt078a7s",
      "accountRelation": { "type": "list" }
    },
    "Transaction": {
      "interface": false,
      "implements": [],
      "id": "kjzl6hvfrbw6c69x6k391k9jth6iiqgfr27468hesq1gnsw1vcrfbyvt7e6xvxu",
      "accountRelation": { "type": "list" }
    }
  },
  "objects": {
    "Confirmation": {
      "owner": { "type": "string", "required": true, "indexed": true },
      "signature": { "type": "string", "required": true },
      "signatureType": { "type": "string", "required": true },
      "submissionDate": { "type": "string", "required": true },
      "transactionHash": { "type": "string", "required": true, "indexed": true },
      "confirmationType": { "type": "string", "required": true }
    },
    "Transaction": {
      "to": { "type": "string", "required": true, "immutable": false },
      "fee": { "type": "string", "required": true, "immutable": false },
      "data": { "type": "string", "required": true, "immutable": false },
      "safe": { "type": "string", "required": true, "immutable": false, "indexed": true },
      "nonce": { "type": "integer", "required": true, "immutable": false },
      "value": { "type": "string", "required": true, "immutable": false },
      "origin": { "type": "string", "required": true, "immutable": false },
      "baseGas": { "type": "integer", "required": true, "immutable": false },
      "gasUsed": { "type": "integer", "required": true, "immutable": false },
      "trusted": { "type": "boolean", "required": true, "immutable": false },
      "executor": { "type": "string", "required": true, "immutable": false, "indexed": true },
      "gasPrice": { "type": "string", "required": true, "immutable": false },
      "gasToken": { "type": "string", "required": true, "immutable": false },
      "modified": { "type": "string", "required": true, "immutable": false },
      "proposer": { "type": "string", "required": true, "immutable": false, "indexed": true },
      "operation": { "type": "integer", "required": true, "immutable": false },
      "safeTxGas": { "type": "integer", "required": true, "immutable": false },
      "isExecuted": { "type": "boolean", "required": true, "immutable": false },
      "safeTxHash": { "type": "string", "required": true, "immutable": false, "indexed": true },
      "signatures": { "type": "string", "required": true, "immutable": false },
      "blockNumber": { "type": "integer", "required": true, "immutable": false },
      "dataDecoded": { "type": "string", "required": true, "immutable": false },
      "ethGasPrice": { "type": "string", "required": true, "immutable": false },
      "isSuccessful": { "type": "boolean", "required": true, "immutable": false },
      "executionDate": { "type": "string", "required": true, "immutable": false },
      "refundReceiver": { "type": "string", "required": true, "immutable": false },
      "submissionDate": { "type": "string", "required": true, "immutable": false },
      "transactionHash": { "type": "string", "required": true, "immutable": false, "indexed": true },
      "confirmationsRequired": { "type": "integer", "required": true, "immutable": false }
    }
  },
  "enums": {},
  "accountData": {
    "confirmationList": { "type": "connection", "name": "Confirmation" }
  }
}