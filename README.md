## Description

The Helix Relayer is a client designed to facilitate the operation of the LnBridge (Liquidate Node Bridge) by relaying messages from the source chain to the target chain. This relayer allows you to efficiently transmit messages and receive rewards from the fees paid by users.

The relayer functions by periodically fetching user transaction data from the Helix indexer service. When it identifies a transaction that requires relaying, it proceeds to perform the relay operation.

## Installation

### configure file
Edit the configure file and put it in the path .maintain/configure.json.
```
{
    "indexer": "https://apollo-test.helixbridge.app/graphql",
    "relayGasLimit": 120000,
    "chains": [
        {
            "name": "arbitrum-goerli",
            "rpc": "https://goerli-rollup.arbitrum.io/rpc",
            "native": "ETH"
        },
        {
            "name": "goerli",
            "rpc": "https://rpc.ankr.com/eth_goerli",
            "native": "ETH"
        }
    ],
    "bridges": [
        {
            "fromChain": "arbitrum-goerli",
            "toChain": "goerli",
            "sourceBridgeAddress": "0xBfbCe15bb38a28add41f3Bf1B80E579ae7B7a4c0",
            "targetBridgeAddress": "0xa5DE45d3eaabA9766B8494170F7E80fd41277a0B",
            "encryptedPrivateKey": "......",
            "providers": [
                {
                    "providerKey": 1,
                    "fromAddress": "0xFBAD806Bdf9cEC2943be281FB355Da05068DE925",
                    "toAddress": "0x1836BAFa3016Dd5Ce543D0F7199cB858ec69F41E"
                }
            ]
        }
    ]
}
```

* indexer
The relayer relies on the trustworthiness of the indexer, which you can find in the provided GitHub repository [indexer](https://github.com/helix-bridge/indexer). Relayers have the option to deploy their own indexer service using this repository.
Please note that Helix also deploys an indexer service, but relayers who choose to use it should be aware that there is a risk of data correctness. It is recommended that relayers proceed with caution and assume responsibility for any potential inaccuracies.

* relayGasLimit
This is the gas limit to send the relay transaction.

* chains
The chain name, native gas token and it's rpc node url.

* bridges
The relayer configuration includes the definition of the fromChain and toChain, specifying the source and target chains respectively. Additionally, it requires the LnBridge address and the wallet private key, which should be encrypted for security purposes.
Furthermore, the relayer configuration encompasses the registration of provider information on the source chain. These provider infos are registered initially to facilitate the relay process.

.env file
```
# The patch of the configure file
LP_BRIDGE_PATH=./.maintain/configure.json
# The store path, DB files to store the last tx hash relayer sent.
LP_BRIDGE_STORE_PATH=./.maintain/db
```

```bash
$ yarn install
```

## Encrypt your private key
```bash
$ yarn crypto
```
To execute the command mentioned above and update the .maintain/configure.json file with the encrypted private key, please follow the steps below:

1. Run the command as specified and provide the necessary input, including the password and private key.
2. The command will output the encrypted private key.
3. Open the .maintain/configure.json file in a text editor.
4. Locate the "encryptedPrivateKey" field in the JSON file.
5. Replace the existing value of "encryptedPrivateKey" with the newly generated encrypted private key obtained from the command's output.
6. Save the changes to the .maintain/configure.json file.

Please make sure to take proper precautions to protect your private key and encrypted private key.

## Running the app

```bash
$ yarn build

$ yarn start
```
