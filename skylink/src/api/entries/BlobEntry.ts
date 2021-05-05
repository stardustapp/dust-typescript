import * as Base64 from 'https://deno.land/std@0.95.0/encoding/base64.ts';

export class BlobEntry {
  Type = "Blob" as const;
  constructor(
    public Name: string,
    public Data: string,
    public Mime: string,
  ) {}

  static fromString(raw: string, mime='text/plain') {
    const encodedBytes = new TextEncoder().encode(raw);
    const dataString = Base64.encode(encodedBytes);
    return new BlobEntry('blob', dataString, mime);
  }

  static fromBytes(rawBytes: Uint8Array, mime='text/plain') {
    const dataString = Base64.encode(rawBytes);
    return new BlobEntry('blob', dataString, mime);
  }

  async asRealBlob() {
    const dataUrl = `data:${this.Mime};base64,${this.Data}`;
    const blobFetch = await fetch(dataUrl);
    return blobFetch.blob();
  }

  asBytes(): Uint8Array {
    return Base64.decode(this.Data);
  }

  inspect() {
    return `<Blob ${JSON.stringify(this.Name)} ${JSON.stringify(this.Mime)}>`;
  }
}
