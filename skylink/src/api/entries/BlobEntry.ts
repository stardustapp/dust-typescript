import * as Base64 from 'https://deno.land/x/base64@v0.2.1/mod.ts';

export class BlobEntry {
  Type = "Blob" as const;
  constructor(
    public Name: string,
    public Data: string,
    public Mime: string,
  ) {}

  static fromString(raw: string, mime='text/plain') {
    const encodedBytes = new TextEncoder().encode(raw);
    const dataString = Base64.fromUint8Array(encodedBytes);
    return new BlobEntry('blob', dataString, mime);
  }

  static fromBytes(rawBytes: Uint8Array, mime='text/plain') {
    const dataString = Base64.fromUint8Array(rawBytes);
    return new BlobEntry('blob', dataString, mime);
  }

  async asRealBlob() {
    const dataUrl = `data:${this.Mime};base64,${this.Data}`;
    const blobFetch = await fetch(dataUrl);
    return blobFetch.blob();
  }

  inspect() {
    return `<Blob ${JSON.stringify(this.Name)} ${JSON.stringify(this.Mime)}>`;
  }
}
