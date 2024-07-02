export interface TxInfo {
  to: string;
  value: string;
  data: string;
}

export abstract class LendMarket {
  public name: string;
  public wrappedToken: string;
  constructor(name: string, wtoken: string) {
    this.name = name;
    this.wrappedToken = wtoken;
  }
  abstract address(): string;
  abstract borrowAvailable(account: string, asset: string): Promise<bigint>;
  abstract batchRepayRawData(onBehalfOf: string): Promise<TxInfo[]>;
  abstract borrowRawData(
    token: string,
    amount: bigint,
    onBehalfOf: string
  ): string;
}