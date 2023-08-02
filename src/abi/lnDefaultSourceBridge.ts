export const lnDefaultSourceBridge = [
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "address",
                "name": "provider",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "address",
                "name": "sourceToken",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint112",
                "name": "baseFee",
                "type": "uint112"
            },
            {
                "indexed": false,
                "internalType": "uint8",
                "name": "liquidityfeeRate",
                "type": "uint8"
            }
        ],
        "name": "LnProviderUpdated",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "bytes32",
                "name": "transferId",
                "type": "bytes32"
            },
            {
                "indexed": false,
                "internalType": "address",
                "name": "provider",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "address",
                "name": "sourceToken",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint112",
                "name": "amount",
                "type": "uint112"
            },
            {
                "indexed": false,
                "internalType": "uint112",
                "name": "fee",
                "type": "uint112"
            },
            {
                "indexed": false,
                "internalType": "address",
                "name": "receiver",
                "type": "address"
            }
        ],
        "name": "TokenLocked",
        "type": "event"
    },
    {
        "inputs": [],
        "name": "INIT_SLASH_TRANSFER_ID",
        "outputs": [
            {
                "internalType": "bytes32",
                "name": "",
                "type": "bytes32"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "LIQUIDITY_FEE_RATE_BASE",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "MAX_TRANSFER_AMOUNT",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "MIN_SLASH_TIMESTAMP",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "provider",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "sourceToken",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "targetToken",
                "type": "address"
            }
        ],
        "name": "getDefaultProviderKey",
        "outputs": [
            {
                "internalType": "bytes32",
                "name": "",
                "type": "bytes32"
            }
        ],
        "stateMutability": "pure",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "provider",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "sourceToken",
                "type": "address"
            }
        ],
        "name": "getProviderKey",
        "outputs": [
            {
                "internalType": "bytes32",
                "name": "",
                "type": "bytes32"
            }
        ],
        "stateMutability": "pure",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "",
                "type": "bytes32"
            }
        ],
        "name": "lnProviders",
        "outputs": [
            {
                "components": [
                    {
                        "internalType": "uint112",
                        "name": "baseFee",
                        "type": "uint112"
                    },
                    {
                        "internalType": "uint8",
                        "name": "liquidityFeeRate",
                        "type": "uint8"
                    }
                ],
                "internalType": "struct LnDefaultBridgeSource.LnProviderFee",
                "name": "fee",
                "type": "tuple"
            },
            {
                "internalType": "uint64",
                "name": "withdrawNonce",
                "type": "uint64"
            },
            {
                "internalType": "bytes32",
                "name": "lastTransferId",
                "type": "bytes32"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "",
                "type": "bytes32"
            }
        ],
        "name": "lockInfos",
        "outputs": [
            {
                "internalType": "uint112",
                "name": "fee",
                "type": "uint112"
            },
            {
                "internalType": "uint112",
                "name": "penalty",
                "type": "uint112"
            },
            {
                "internalType": "bool",
                "name": "isLocked",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "protocolFeeReceiver",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "sourceToken",
                "type": "address"
            },
            {
                "internalType": "uint112",
                "name": "baseFee",
                "type": "uint112"
            },
            {
                "internalType": "uint8",
                "name": "liquidityFeeRate",
                "type": "uint8"
            }
        ],
        "name": "setProviderFee",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "name": "tokenInfos",
        "outputs": [
            {
                "internalType": "address",
                "name": "targetToken",
                "type": "address"
            },
            {
                "internalType": "uint112",
                "name": "protocolFee",
                "type": "uint112"
            },
            {
                "internalType": "uint112",
                "name": "penaltyLnCollateral",
                "type": "uint112"
            },
            {
                "internalType": "uint8",
                "name": "sourceDecimals",
                "type": "uint8"
            },
            {
                "internalType": "uint8",
                "name": "targetDecimals",
                "type": "uint8"
            },
            {
                "internalType": "bool",
                "name": "isRegistered",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "provider",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "sourceToken",
                "type": "address"
            },
            {
                "internalType": "uint112",
                "name": "amount",
                "type": "uint112"
            }
        ],
        "name": "totalFee",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "components": [
                    {
                        "internalType": "address",
                        "name": "provider",
                        "type": "address"
                    },
                    {
                        "internalType": "address",
                        "name": "sourceToken",
                        "type": "address"
                    },
                    {
                        "internalType": "bytes32",
                        "name": "transferId",
                        "type": "bytes32"
                    },
                    {
                        "internalType": "uint112",
                        "name": "totalFee",
                        "type": "uint112"
                    },
                    {
                        "internalType": "uint64",
                        "name": "withdrawNonce",
                        "type": "uint64"
                    }
                ],
                "internalType": "struct LnDefaultBridgeSource.Snapshot",
                "name": "snapshot",
                "type": "tuple"
            },
            {
                "internalType": "uint112",
                "name": "amount",
                "type": "uint112"
            },
            {
                "internalType": "address",
                "name": "receiver",
                "type": "address"
            }
        ],
        "name": "transferAndLockMargin",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    }
];

