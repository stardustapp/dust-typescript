import {BaseElement} from './_base.ts';

export class Blob extends BaseElement {
  constructor(
    public mimeType: string,
    public encoding: string | null,
  ) {
    super();
    this.mimeType = mimeType;
    this.encoding =
      this.encoding ? encoding
      : !mimeType ? null
      : mimeType.startsWith('text/') ? 'utf-8'
      : 'binary';
  }

  static family = "Blob";
  get config() {
    return {
      mimeType: this.mimeType,
      encoding: this.encoding,
    };
  }
}
