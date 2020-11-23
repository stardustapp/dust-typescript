export class StringEntry {
  Type = "String" as const;
  StringValue!: string;
  constructor(
    public Name: string,
    value?: string,
  ) {
    this.set(value);
  }

  set(value?: string) {
    this.StringValue = value || '';
    if (this.StringValue.constructor !== String) {
      throw new Error(`StringLiteral ${JSON.stringify(this.Name)} cannot contain a ${this.StringValue.constructor} value`);
    }
  }

  inspect() {
    return `<String ${JSON.stringify(this.Name)} ${JSON.stringify(this.StringValue)}>`;
  }
}
