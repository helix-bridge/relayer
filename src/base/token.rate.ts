import { BigNumber } from "ethers";

export abstract class TokenRate {
    abstract simulateSwap(
        tokenIn: string,
        tokenOut: string,
        amountIn: BigNumber
    ): BigNumber;
    abstract simulateNativeSwap(
        tokenIn: string,
        amountIn: BigNumber
    ): BigNumber;
}

export class UniswapTokenRate implements TokenRate {
    simulateSwap(
        tokenIn: string,
        tokenOut: string,
        amountIn: BigNumber
    ): BigNumber {
        //TODO
        return amountIn;
    }
    simulateNativeSwap(
        tokenIn: string,
        amountIn: BigNumber
    ): BigNumber {
        return amountIn;
    }
}
