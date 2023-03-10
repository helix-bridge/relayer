export const uniswap = [
  {
    type: "function",
    stateMutability: "view",
    outputs: [
      {
        type: "uint256[]",
        name: "amounts",
        internalType: "uint256[]",
      },
    ],
    name: "getAmountsOut",
    inputs: [
      {
        type: "uint256",
        name: "amountIn",
        internalType: "uint256",
      },
      {
        type: "address[]",
        name: "path",
        internalType: "address[]",
      },
    ],
  },
  {
    type: "function",
    stateMutability: "view",
    outputs: [
      {
        type: "address",
        name: "",
        internalType: "address",
      },
    ],
    name: "WETH",
    inputs: [],
  },
];
