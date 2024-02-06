import { ethers } from "ethers";

export class EtherBigNumber {
  protected Data: bigint;
  constructor(value: string | number | bigint) {
    this.Data = BigInt(value.toString());
  }

  get Number(): bigint {
    return this.Data;
  }
}

export class Any extends EtherBigNumber {
  constructor(value: string | number, pow: number) {
    const bignumber = ethers.parseUnits(value.toString(), pow);
    super(bignumber);
  }
}

export class Ether extends EtherBigNumber {
  constructor(value: string | number | bigint) {
    const bignumber = ethers.parseEther(value.toString().substr(0, 20));
    super(bignumber);
  }
}

export class GWei extends EtherBigNumber {
  constructor(value: string | number | bigint) {
    if (typeof value === "bigint") {
      super(value);
    } else {
      const bignumber = ethers.parseUnits(value.toString(), 9);
      super(bignumber);
    }
  }

  mul(scaleValue: number) {
    const scale = new GWei(scaleValue);
    const unit = new GWei(1);
    return new GWei((this.Data * scale.Number) / unit.Number);
  }
}
