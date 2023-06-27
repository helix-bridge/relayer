export const lnTargetBridge = [
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "uint8",
          "name": "version",
          "type": "uint8"
        }
      ],
      "name": "Initialized",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "address",
          "name": "account",
          "type": "address"
        }
      ],
      "name": "Paused",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "role",
          "type": "bytes32"
        },
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "previousAdminRole",
          "type": "bytes32"
        },
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "newAdminRole",
          "type": "bytes32"
        }
      ],
      "name": "RoleAdminChanged",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "role",
          "type": "bytes32"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "account",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "sender",
          "type": "address"
        }
      ],
      "name": "RoleGranted",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "role",
          "type": "bytes32"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "account",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "sender",
          "type": "address"
        }
      ],
      "name": "RoleRevoked",
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
          "name": "slasher",
          "type": "address"
        }
      ],
      "name": "TransferFilled",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "address",
          "name": "account",
          "type": "address"
        }
      ],
      "name": "Unpaused",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "bytes32",
          "name": "lastTransferId",
          "type": "bytes32"
        },
        {
          "indexed": false,
          "internalType": "uint112",
          "name": "amount",
          "type": "uint112"
        }
      ],
      "name": "WithdrawMargin",
      "type": "event"
    },
    {
      "inputs": [],
      "name": "DAO_ADMIN_ROLE",
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
      "name": "DEFAULT_ADMIN_ROLE",
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
      "name": "MIN_REFUND_TIMESTAMP",
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
      "name": "OPERATOR_ROLE",
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
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "",
          "type": "bytes32"
        }
      ],
      "name": "fillTransfers",
      "outputs": [
        {
          "internalType": "bytes32",
          "name": "latestSlashTransferId",
          "type": "bytes32"
        },
        {
          "internalType": "address",
          "name": "slasher",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "role",
          "type": "bytes32"
        }
      ],
      "name": "getRoleAdmin",
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
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "role",
          "type": "bytes32"
        },
        {
          "internalType": "uint256",
          "name": "index",
          "type": "uint256"
        }
      ],
      "name": "getRoleMember",
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
          "internalType": "bytes32",
          "name": "role",
          "type": "bytes32"
        }
      ],
      "name": "getRoleMemberCount",
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
              "internalType": "uint64",
              "name": "providerKey",
              "type": "uint64"
            },
            {
              "internalType": "bytes32",
              "name": "previousTransferId",
              "type": "bytes32"
            },
            {
              "internalType": "bytes32",
              "name": "lastBlockHash",
              "type": "bytes32"
            },
            {
              "internalType": "uint112",
              "name": "amount",
              "type": "uint112"
            },
            {
              "internalType": "uint64",
              "name": "nonce",
              "type": "uint64"
            },
            {
              "internalType": "uint64",
              "name": "timestamp",
              "type": "uint64"
            },
            {
              "internalType": "address",
              "name": "token",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "receiver",
              "type": "address"
            }
          ],
          "internalType": "struct LnBridgeHelper.TransferParameter",
          "name": "param",
          "type": "tuple"
        }
      ],
      "name": "getTransferId",
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
          "name": "role",
          "type": "bytes32"
        },
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        }
      ],
      "name": "grantRole",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "role",
          "type": "bytes32"
        },
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        }
      ],
      "name": "hasRole",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "inbox",
      "outputs": [
        {
          "internalType": "contract IInbox",
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
          "name": "_dao",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "_inbox",
          "type": "address"
        }
      ],
      "name": "initialize",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "pause",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "paused",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "remoteBridge",
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
          "internalType": "bytes32",
          "name": "role",
          "type": "bytes32"
        },
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        }
      ],
      "name": "renounceRole",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "lastTransferId",
          "type": "bytes32"
        },
        {
          "internalType": "uint112",
          "name": "amount",
          "type": "uint112"
        },
        {
          "internalType": "uint256",
          "name": "maxSubmissionCost",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "maxGas",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "gasPriceBid",
          "type": "uint256"
        }
      ],
      "name": "requestWithdrawMargin",
      "outputs": [],
      "stateMutability": "payable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "transferId",
          "type": "bytes32"
        },
        {
          "internalType": "uint256",
          "name": "maxSubmissionCost",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "maxGas",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "gasPriceBid",
          "type": "uint256"
        }
      ],
      "name": "retryRemoteRefund",
      "outputs": [],
      "stateMutability": "payable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "role",
          "type": "bytes32"
        },
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        }
      ],
      "name": "revokeRole",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_remoteBridge",
          "type": "address"
        }
      ],
      "name": "setRemoteBridge",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "components": [
            {
              "internalType": "uint64",
              "name": "providerKey",
              "type": "uint64"
            },
            {
              "internalType": "bytes32",
              "name": "previousTransferId",
              "type": "bytes32"
            },
            {
              "internalType": "bytes32",
              "name": "lastBlockHash",
              "type": "bytes32"
            },
            {
              "internalType": "uint112",
              "name": "amount",
              "type": "uint112"
            },
            {
              "internalType": "uint64",
              "name": "nonce",
              "type": "uint64"
            },
            {
              "internalType": "uint64",
              "name": "timestamp",
              "type": "uint64"
            },
            {
              "internalType": "address",
              "name": "token",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "receiver",
              "type": "address"
            }
          ],
          "internalType": "struct LnBridgeHelper.TransferParameter",
          "name": "params",
          "type": "tuple"
        },
        {
          "internalType": "bytes32",
          "name": "expectedTransferId",
          "type": "bytes32"
        },
        {
          "internalType": "uint256",
          "name": "maxSubmissionCost",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "maxGas",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "gasPriceBid",
          "type": "uint256"
        }
      ],
      "name": "slashAndRemoteRefund",
      "outputs": [],
      "stateMutability": "payable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "baseFee",
          "type": "uint256"
        },
        {
          "internalType": "bytes32",
          "name": "latestSlashTransferId",
          "type": "bytes32"
        },
        {
          "internalType": "bytes32",
          "name": "transferId",
          "type": "bytes32"
        },
        {
          "internalType": "address",
          "name": "slasher",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "percentIncrease",
          "type": "uint256"
        }
      ],
      "name": "submissionRefundFee",
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
          "internalType": "uint256",
          "name": "baseFee",
          "type": "uint256"
        },
        {
          "internalType": "bytes32",
          "name": "lastTransferId",
          "type": "bytes32"
        },
        {
          "internalType": "uint112",
          "name": "amount",
          "type": "uint112"
        },
        {
          "internalType": "uint256",
          "name": "percentIncrease",
          "type": "uint256"
        }
      ],
      "name": "submissionWithdrawFee",
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
          "internalType": "bytes4",
          "name": "interfaceId",
          "type": "bytes4"
        }
      ],
      "name": "supportsInterface",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
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
              "internalType": "uint64",
              "name": "providerKey",
              "type": "uint64"
            },
            {
              "internalType": "bytes32",
              "name": "previousTransferId",
              "type": "bytes32"
            },
            {
              "internalType": "bytes32",
              "name": "lastBlockHash",
              "type": "bytes32"
            },
            {
              "internalType": "uint112",
              "name": "amount",
              "type": "uint112"
            },
            {
              "internalType": "uint64",
              "name": "nonce",
              "type": "uint64"
            },
            {
              "internalType": "uint64",
              "name": "timestamp",
              "type": "uint64"
            },
            {
              "internalType": "address",
              "name": "token",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "receiver",
              "type": "address"
            }
          ],
          "internalType": "struct LnBridgeHelper.TransferParameter",
          "name": "params",
          "type": "tuple"
        },
        {
          "internalType": "bytes32",
          "name": "expectedTransferId",
          "type": "bytes32"
        }
      ],
      "name": "transferAndReleaseMargin",
      "outputs": [],
      "stateMutability": "payable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "unpause",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "stateMutability": "payable",
      "type": "receive"
    }
];