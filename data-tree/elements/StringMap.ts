import {BaseParentElement} from './_base.ts';

export class StringMap extends BaseParentElement {

  static family = "Map";
  get config() {
    return {
      keyType: 'String',
    };
  }
}
