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

```
Each configuration of bridges is centered on a target chain that receives token assets from other chains. Each token asset has its address in both the source and target chains, and the relayer account has a balance for that asset. User payments are made using transfer tokens, relayer delivery transactions are paid using target chain gas fees, and no configuration requires a price conversion language machine between them.

▾ indexer        ---  the indexer url, see repo https://github.com/helix-bridge/indexer, it support the helix cross-chain records query API.
▾ relayGasLimit  --- use this limit value to send the relay transaction.
▾ chains         --- all the chains information the relayer used. In other sections, they use the name of the chain in this section to find the info.
▾ bridges        --- bridge list
  privateKey     --- the private key of the relayer
  toChain        --- toChain name defined in section chains
  minProfit      --- the min profit of each transaction (converted to gas token of the target chain)
  bridgeAddress    --- the lpBridge contract address deployed by helix
  ▾ tokens         --- the token list
    toAddress      --- the token address on target chain
    ▾ fromAddresses    --- the token list on different source chains
      chainName        --- the source chain name defined in section chains
      fromAddress      --- the token address on source chain
      feeTokenAddress  --- the token address on price oracle
  ▾ priceOracle    --- the price oracle, currently only support UniswapTokenPriceOracle, which is uniswap real-time exchange price
    name               --- the oracle name
    chainName          --- the chain name where oracle deployed
    relayerGasFeeToken --- the gas token address on price oracle, usually the wrapped native token.
    configure          --- the oracle configure, for UniswapTokenPriceOracle, it's uniswap router address
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
