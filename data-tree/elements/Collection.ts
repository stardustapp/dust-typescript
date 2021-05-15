import {BaseParentElement} from './_base.ts';

export class Collection extends BaseParentElement {

  static family = "Collection";
  get config() {
    return {
      idType: 'Random',
    };
  }

}
