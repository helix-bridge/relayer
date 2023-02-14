## Description

Helix relayer is a client to run the LpBridge to relay message from one chain to another chain supported by helix. You can use it to relay message and get reward from the fee payed by users.

## Installation

configure file
```
{
    "indexer": "https://apollo-stg.helixbridge.app/graphql",
    "relayGasLimit": 100000,
    "chains": [
        {
            "name": "darwinia-dvm",
            "rpc": "https://darwinia-rpc.dwellir.com",
            "native": "RING"
        },
        {
            "name": "ethereum",
            "rpc": "https://eth-mainnet.g.alchemy.com/v2/KEY",
            "native": "ETH"
        }
    ],
    "bridges": [
        {
            "privateKey": "0x...",
            "toChain": "darwinia-dvm",
            "minProfit": "50.3",
            "bridgeAddress": "0x84f7a56483C100ECb12CbB4A31b7873dAE0d8E9B",
            "tokens": [
                {
                    "toAddress": "0xE7578598Aac020abFB918f33A20faD5B71d670b4",
                    "fromAddresses": [
                        {
                            "chainName": "ethereum",
                            "fromAddress": "0x9469D013805bFfB7D3DEBe5E7839237e535ec483",
                            "feeTokenAddress": "0x9469D013805bFfB7D3DEBe5E7839237e535ec483"
                        }
                    ]
                }
            ],
            "priceOracle": {
                "name": "UniswapTokenPriceOracle",
                "chainName": "ethereum",
                "relayerGasFeeToken": "0x9469D013805bFfB7D3DEBe5E7839237e535ec483",
                "configure": {
                    "address": "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
                }
            }
        },
        {
            "privateKey": "0x...",
            "toChain": "ethereum",
            "minProfit": "0.002",
            "bridgeAddress": "0x5F8D4232367759bCe5d9488D3ade77FCFF6B9b6B",
            "tokens": [
                {
                    "toAddress": "0x9469D013805bFfB7D3DEBe5E7839237e535ec483",
                    "fromAddresses": [
                        {
                            "chainName": "darwinia-dvm",
                            "fromAddress": "0xE7578598Aac020abFB918f33A20faD5B71d670b4",
                            "feeTokenAddress": "0x9469D013805bFfB7D3DEBe5E7839237e535ec483"
                        }
                    ]
                }
            ],
            "priceOracle": {
                "name": "UniswapTokenPriceOracle",
                "chainName": "ethereum",
                "relayerGasFeeToken": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                "configure": {
                    "address": "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
                }
            }
        }
    ]
}
```

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

## Running the app

```bash
$ yarn build

$ yarn start
```

## Docker

```bash
docker build . -t relayer:v1.0.0

# You need put the configure.json file in directory ./data first
docker-compose up -d
```
