import { ethers, BigNumber } from "ethers";

export class EtherBigNumber {
  protected Data: BigNumber;
  constructor(value: string | number | BigNumber) {
    this.Data = BigNumber.from(value.toString());
  }

  get Number(): BigNumber {
    return this.Data;
  }
}

export class Any extends EtherBigNumber {
  constructor(value: string | number, pow: number) {
    const bignumber = ethers.utils.parseUnits(value.toString(), pow);
    super(bignumber);
  }
}

export class Ether extends EtherBigNumber {
  constructor(value: string | number | BigNumber) {
    const bignumber = ethers.utils.parseEther(value.toString());
    super(bignumber);
  }
}

export class GWei extends EtherBigNumber {
  constructor(value: string | number | BigNumber) {
    if (value instanceof BigNumber) {
      super(value);
    } else {
      const bignumber = ethers.utils.parseUnits(value.toString(), 9);
      super(bignumber);
    }
  }

  mul(scaleValue: number) {
    const scale = new GWei(scaleValue);
    const unit = new GWei(1);
    return new GWei(this.Data.mul(scale.Number).div(unit.Number));
  }
}
