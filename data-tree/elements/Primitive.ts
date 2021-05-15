import {BaseElement} from './_base.ts';

export class Primitive extends BaseElement {
  jsType: string;
  constructor(jsConstr: Function) {
    super();
    this.jsType = jsConstr.name;
  }

  static family = "Primitive";
  get config() {
    return {
      type: this.jsType,
    };
  }
}
