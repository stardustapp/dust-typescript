import {BaseElement} from './_base.ts';

const ValidMetaTypes = new Set([
  'doc id',
]);

export class Meta extends BaseElement {
  constructor(
    public readonly metaStr: string,
  ) {
    super();
    if (!ValidMetaTypes.has(metaStr)) throw new Error(
      `Meta string "${metaStr}" not expected`);
  }

  static family = "Meta";
  get config() {
    return {
      type: this.metaStr,
    };
  }
}
