export interface TxInfo {
  to: string;
  value: string;
  data: string;
}

export interface WithdrawBorrowBalance {
  withdraw: bigint;
  borrow: bigint;
}

export const maxU256: bigint = BigInt(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
);

export abstract class LendMarket {
  public name: string;
  public wrappedToken: string;
  constructor(name: string, wtoken: string) {
    this.name = name;
    this.wrappedToken = wtoken?.toLowerCase();
  }
  abstract lendingFromPoolTxs(
    token: string,
    amount: bigint,
    onBehalfOf: string
  ): Promise<TxInfo[]>;
  abstract borrowAvailable(account: string, asset: string): Promise<bigint>;
  abstract withdrawAndBorrowAvailable(
    account: string,
    asset: string
  ): Promise<WithdrawBorrowBalance>;
  abstract batchRepayRawData(onBehalfOf: string): Promise<TxInfo[]>;
  abstract borrowRawData(
    token: string,
    amount: bigint,
    onBehalfOf: string
  ): string;
  abstract withdrawRawData(
    token: string,
    amount: bigint,
    onBehalfOf: string
  ): string;
}
