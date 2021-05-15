import {BaseParentElement} from './_base.ts';

export class NamedCollection extends BaseParentElement {

  static family = "Collection";
  get config() {
    return {
      idType: 'Named',
    };
  }
}
