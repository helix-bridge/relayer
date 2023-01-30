import { BigNumber } from "ethers";
import { UniswapContract } from "../base/contract";
import { EthereumProvider } from "../base/provider";

export interface UniswapTokenPriceOracleArgs {
  address: string;
}

export namespace PriceOracle {
  export abstract class TokenPriceOracle {
    abstract simulateSwap(
      tokenIn: string,
      tokenOut: string,
      amountIn: BigNumber
    ): Promise<BigNumber>;
    abstract simulateNativeSwap(
      tokenIn: string,
      amountIn: BigNumber
    ): Promise<BigNumber>;
  }

  export class UniswapTokenPriceOracle implements TokenPriceOracle {
    private uniswapContract: UniswapContract;
    constructor(
      provider: EthereumProvider,
      configure: UniswapTokenPriceOracleArgs
    ) {
      this.uniswapContract = new UniswapContract(
        configure.address,
        provider.provider
      );
    }
    async simulateSwap(
      tokenIn: string,
      tokenOut: string,
      amountIn: BigNumber
    ): Promise<BigNumber> {
      if (tokenIn === tokenOut) {
        return amountIn;
      }
      return await this.uniswapContract.getAmountsOut(amountIn, [
        tokenIn,
        tokenOut,
      ]);
    }
    async simulateNativeSwap(
      tokenIn: string,
      amountIn: BigNumber
    ): Promise<BigNumber> {
      const tokenOut = await this.uniswapContract.weth();
      return await this.simulateSwap(tokenIn, tokenOut, amountIn);
    }
  }
}
