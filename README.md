## Description

The Helix Relayer is a client designed to facilitate the operation of the LnBridge (Liquidate Node Bridge) by relaying messages from the source chain to the target chain. This relayer allows you to efficiently transmit messages and receive rewards from the fees paid by users.

The relayer functions by periodically fetching user transaction data from the Helix indexer service. When it identifies a transaction that requires relaying, it proceeds to perform the relay operation.

## Register
### LnBridge with direction "Default"
1. Call `setProviderFee` method of the LnBridge contract on the source chain to set the fee(include base fee and liquidity fee).
2. Call `depositProviderMargin` method of the LnBridge contract on the target chain to deposit margin. Before calling the method, relayer should approve the contract to use the source token.
3. Optional method `depositSlashFundReserve` is used to deposit for Slasher a certain amount of gas fee compensation, if there is no pledge of this compensation, the backend will reduce the probability of recommending the relayer to the user.
### LnBridge with direction "Opposite"
Call `updateProviderFeeAndMargin` method of the LnBridge contract on the source chain to set fee and deposit margin. Before doing this, relayer should approve token transfer first.

## Configure
The default configure file path is
```
.maintain/configure.json
```

You need configure the `.env` file as follows to indict the configure file path and store path.
```
# The path of the configure file
LP_BRIDGE_PATH=./.maintain/configure.json
# The store path, DB files to store the last tx hash relayer sent.
LP_BRIDGE_STORE_PATH=./.maintain/db
```

The details of each field in the configuration file are as follows.

| Field | Description |
|-------| ----------- |
| indexer | The relayer relies on the trustworthiness of the indexer, which you can find in the provided GitHub repository [indexer](https://github.com/helix-bridge/indexer). Relayers have the option to deploy their own indexer service using this repository.<br> Please note that Helix also deploys an indexer service, but relayers who choose to use it should be aware that there is a risk of data correctness. It is recommended that relayers proceed with caution and assume responsibility for any potential inaccuracies. |
| relayGasLimit | The gasLimit for relay transactions, which may be different for different chains, but we can pick the highest limit that supports them, because the actual transactions consume less gas than this limit. |
| chains | Relayers need to configure the name(which will be used in a later field), rpc url and native token symbol (which is not used at the moment). |
| bridges | This client supports running multiple token bridges and tokens simultaneously, bridges is an array where each element of the array represents an instance of an asset bridge in one direction|

The attributes of `bridges` are as follows
| Attributes | Description |
|------------| ----------- |
| fromChain | Source chain name, which needs to be in the chains field. |
| toChain | Target chain name, which also needs to be in the chains field. |
| sourceBridgeAddress | Source LnBridge Contract Address. |
| targetBridgeAddress | Target LnBridge Contract Address. |
| encryptedPrivateKey | Encrypted private key by using `yarn crypto` command.|
| minProfit & maxProfit | Maximum and Minimum Profit (Native token), as the price of the gas on the target chain adjusts, the client automatically adjusts the fee to the middle of the maximum and minimum profit range when it sees that the profit has jumped out of their range.|
| feeLimit | Relay cost cap, used to protect against programmatic exceptions and to prevent the sending of transactions with too high a gas price. |
| reorgThreshold | This threshold is used to prevent the reorg of transactions on the source chain, and needs to be set by the relayer itself to a suitable value to prevent the loss of assets due to reorg.|
| direction | The direction of the protocol used by the bridge, the optional values are opposite and default. |
| providers | Is an array indicating that a relayer can provide bridge services for multiple tokens in the same direction. Include<br> 1. fromAddress: The address of the token on the source chain, or all zeros in the case of native tokens<br> 2. toAddress: The address of the token on the target chain, or all zeros in the case of native tokens<br> 3. swapRate: The exchange rate between the native token on the target chain and the transfer token is used to calculate cross-chain costs and profits.<br> 4. srcDecimals: The decimals of the token on the source chain.|

### Example
Here is a specific example on testnet arbitrum-goerli <-> goerli.
#### USDC
[0xEA70a40Df1432A1b38b916A51Fb81A4cc805a963](https://goerli.arbiscan.io/address/0xEA70a40Df1432A1b38b916A51Fb81A4cc805a963)(arbitrum-goerli)

[0xd35CCeEAD182dcee0F148EbaC9447DA2c4D449c4](https://goerli.etherscan.io/address/0xd35CCeEAD182dcee0F148EbaC9447DA2c4D449c4)(goerli)
#### arbitrum-goerli -> goerli (opposite)
LnBridgeSourceAddress: [0x7B8413FA1c1033844ac813A2E6475E15FB0fb3BA](https://goerli.arbiscan.io/address/0x7B8413FA1c1033844ac813A2E6475E15FB0fb3BA)

LnBridgeTargetAddress: [0x3B1A953bFa72Af4ae3494b08e453BFF30a06A550](https://goerli.etherscan.io/address/0x3B1A953bFa72Af4ae3494b08e453BFF30a06A550)

Register:
```
Step1(arbitrum-goerli):
Erc20(0x7B8413FA1c1033844ac813A2E6475E15FB0fb3BA).approve(0x7B8413FA1c1033844ac813A2E6475E15FB0fb3BA, 10000000000);

Step2(arbitrum-goerli):
LnOppositeBridgeSource(0x7B8413FA1c1033844ac813A2E6475E15FB0fb3BA).updateProviderFeeAndMargin(
  0x7B8413FA1c1033844ac813A2E6475E15FB0fb3BA,
  10000000000,
  3000000,
  100
);
```
#### goerli -> arbitrum-goerli (default)
LnBridgeSourceAddress: [0xcD86cf37a4Dc6f78B4899232E7dD1b5c8130EFDA](https://goerli.etherscan.io/address/0xcD86cf37a4Dc6f78B4899232E7dD1b5c8130EFDA)

LnBridgeTargetAddress: [0x4112c9d474951246fBC2B4D868D247e714698aE1](https://goerli.arbiscan.io/address/0x4112c9d474951246fBC2B4D868D247e714698aE1)

Register:
```
Step1(goerli):
LnDefaultBridgeSource(0xcD86cf37a4Dc6f78B4899232E7dD1b5c8130EFDA).setProviderFee(
  0xd35CCeEAD182dcee0F148EbaC9447DA2c4D449c4,
  3000000,
  100
);

Step2(arbitrum-goerli):
Erc20(0x4112c9d474951246fBC2B4D868D247e714698aE1).approve(0x4112c9d474951246fBC2B4D868D247e714698aE1, 10000000000);

Step3(arbitrum-goerli):
LnDefaultBridgeTarget(0xEA70a40Df1432A1b38b916A51Fb81A4cc805a963).depositProviderMargin(
  0xd35CCeEAD182dcee0F148EbaC9447DA2c4D449c4,
  0xEA70a40Df1432A1b38b916A51Fb81A4cc805a963,
  10000000000
);
```

#### configure file

Edit the configure file and put it in the path .maintain/configure.json.
```
{
    "indexer": "https://apollo-test.helixbridge.app/graphql",
    "relayGasLimit": 600000,
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
            "sourceBridgeAddress": "0x7B8413FA1c1033844ac813A2E6475E15FB0fb3BA",
            "targetBridgeAddress": "0x3B1A953bFa72Af4ae3494b08e453BFF30a06A550",
            "encryptedPrivateKey": "...",
            "minProfit": 0.005,
            "maxProfit": 0.01,
            "feeLimit": 0.01,
            "reorgThreshold": 100,
            "direction": "opposite",
            "providers": [
                {
                    "fromAddress": "0xEA70a40Df1432A1b38b916A51Fb81A4cc805a963",
                    "toAddress": "0xd35CCeEAD182dcee0F148EbaC9447DA2c4D449c4",
                    "swapRate": 2000,
                    "srcDecimals": 6
                }
            ]
        },
        {
            "fromChain": "goerli",
            "toChain": "arbitrum-goerli",
            "sourceBridgeAddress": "0xcD86cf37a4Dc6f78B4899232E7dD1b5c8130EFDA",
            "targetBridgeAddress": "0x4112c9d474951246fBC2B4D868D247e714698aE1",
            "encryptedPrivateKey": "...",
            "minProfit": 0,
            "maxProfit": 1,
            "feeLimit": 0.01,
            "reorgThreshold": 10,
            "direction": "default",
            "providers": [
                {
                    "fromAddress": "0xd35CCeEAD182dcee0F148EbaC9447DA2c4D449c4",
                    "toAddress": "0xEA70a40Df1432A1b38b916A51Fb81A4cc805a963",
                    "swapRate": 2000,
                    "srcDecimals": 6
                }
            ]
        }
    ]
}

```

## Install & Run Client
Before start, relayers need to approve LnBridge to transferFrom their tokens.
```bash
$ yarn install

$ yarn build

$ yarn start

# Enter Password to Start
```

## Encrypt your private key
```bash
$ yarn crypto
```
To execute the command mentioned above and update the `.maintain/configure.json` file with the encrypted private key, please follow the steps below:

1. Run the command as specified and provide the necessary input, including the password and private key.
2. The command will output the encrypted private key.
3. Open the `.maintain/configure.json` file in a text editor.
4. Locate the "encryptedPrivateKey" field in the JSON file.
5. Replace the existing value of `encryptedPrivateKey` with the newly generated encrypted private key obtained from the command's output.
6. Save the changes to the `.maintain/configure.json` file.

Please make sure to take proper precautions to protect your private key and encrypted private key.

## Slash & Margin Withdraw
When the relayer is not working, Slasher needs to call the contract interface to help the user to complete the transfer and get a penalty from the relayer as a reward. When the relayer wishes to exit, it needs to call the contract interface to complete the exit and withdraw the pledge margin. There is a difference in the contract operation here for different chains, due to the different messages used in the message layer.
### arbitrum -> ethereum (opposite)
1. Slash

First call `submissionRefundFee` on the target chain ethereum to get the submissionFee fee.
Then call `slashAndRemoteRefund` to send a Slash request to the source chain The cost is `submissionFee + maxGas * gasPriceBid`, and the excess cost is refunded to the sending account.
If the execution of the target chain fails, call `retryRemoteRefund` to retry.

2. Withdraw

First call `submissionWithdrawFee` on the target chain ethereum to get the submissionFee fee.
Then call `requestWithdrawMargin` to send a Withdraw request to the source chain, the cost is `submissionFee + maxGas * gasPriceBid`, and the excess cost is refunded to the sending account.

### ethereum -> arbitrum (default)
1. Slash

First call `submissionSlashFee` on the source ethereum chain to get the submissionFee fee.
Then call `slashAndRemoteRelease` to send a slash request to the target chain, the cost is `submissionFee + maxGas * gasPriceBid`, the excess cost will be refunded to the sending account.

2. Withdraw

The `submissionWithdrawFee` is first called on the source chain ethereum to get the submissionFee fee.
Then call `requestWithdrawMargin` to send the Withdraw request to the target chain, the cost is `submissionFee + maxGas * gasPriceBid`, the excess cost will be refunded to the sending account.
### zkSync -> ethereum (opposite)
1. Slash

First use `l2Fee` to get fees on the target chain ethereum.
Then call `slashAndRemoteRefund` to send a Slash request to the source chain at a cost of l2Fee.
If the execution of the target chain fails, call `retryRemoteRefund` to retry.

2. Withdraw

First use `l2Fee` to get fees on the target chain ethereum.
Then call `requestWithdrawMargin` to send an Withdraw request to the source chain, at a cost of l2Fee.
### ethereum -> zkSync (default)
1. Slash

First use `l2Fee` to get fees on the source chain ethereum.
Then call `slashAndRemoteRelease` to send a slash request to the target chain with the cost of l2Fee.

2. Withdraw

First use `l2Fee` to get fees on the source chain ethereum.
Then call `requestWithdrawMargin` to send an Withdraw request to the target chain, at a cost of l2Fee
### Linea -> ethereum (opposite)
1. Slash

Execute `slashAndRemoteRefund` on the target chain ethereum with the cost set to 0.
After waiting about 15 minutes for the transaction hash to be relayed to the source chain, execute the `claimMessage` interface of the Linea messageService contract on the source chain.

2. Withdraw

Execute `requestWithdrawMargin` on the target chain ethereum with the cost set to 0.
After the transaction hash has been relayed to the source chain in about 15 minutes, execute the `claimMessage` interface of the Linea messageService contract.
### ethereum -> Linea (default)
1. Slash

Execute `slashAndRemoteRelease` on source chain ethereum with cost set to 0.
After waiting about 15 minutes for the transaction hash to be relayed to the target chain, execute the `claimMessage` interface of the Linea messageService contract.

2. Withdraw

Execute `requestWithdrawMargin` on source chain ethereum with cost set to 0.
After waiting about 15 minutes for the transaction hash to be relayed to the target chain, execute the `claimMessage` interface of the Linea messageService contract.
### Linea<>zkSync<>arbitrum（default, based on [LayerZero](https://github.com/LayerZero-Labs/LayerZero)）
1. Slash

The `estimateSlashFee` interface is used on the source chain to estimate the cost, and the `slashAndRemoteRelease` interface is called to send the request to the target chain.
If the execution of the target chain fails and needs to be retried, use the `retryPayload` interface of the layerzero endpoint contract to do so.

2. Withdraw

The `estimateWithdrawFee` interface is used on the source chain to estimate the cost, and the `requestWithdrawMargin` interface is called to send the request to the target chain.
If the target chain fails and needs to be retried, use the `retryPayload` interface of the layerzero endpoint contract to do so.
It is possible that the target chain succeeds, but the result fails, so if you want to retry, you can only retry in the source chain.

## Message Channel
* arbitrum L2

```
// 1. call function fee() to get submissionCost[message channel]
function fee(
    uint256 _callSize,
    uint256 _l1GasPrice,
    uint256 _l2GasPrice,
    uint256 _l2GasLimit,
    uint256 _percentIncrease
) external view returns(uint256, uint256);
// 2. call encodeParams to get _extParams[message channel]
function encodeParams(
   uint256 _maxSubmissionCost,
   uint256 _l2GasPrice,
   uint256 _l2GasLimit,
   address _refunder
);
```

* linea L2


```
// 1. set fee to be zero
// 2. call claimMessage on target chain
```

* Layerzero

```
// 1. call function fee to get bridge fee
function fee(
    uint256 _remoteChainId,
    bytes memory _message
)
// 2. params is the refund address
```

* axelar

```
// 1. estimate bridge fee, more then required, example 0.001 eth on goerli
// 2. params is the refund address
// 3. on target chain, the gas fee will be refund
```

