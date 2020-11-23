export class ErrorEntry {
  Type = "Error" as const;
  StringValue!: string;
  constructor(
    public Name: string,
    public Code: string,
    public Authority: string,
    message: string,
  ) {
    this.set(message);
  }

  static internalErr(code: string, message: string) {
    return new ErrorEntry('Error', code, 'skylink/internal@'+import.meta.url, message);
  }

  set(message: string) {
    this.StringValue = message || '';
    if (typeof this.StringValue !== 'string') throw new Error(
      `ErrorEntry ${JSON.stringify(this.Name)} cannot contain a ${this.StringValue!.constructor} message`);
  }

  inspect() {
    return `<Error ${JSON.stringify(this.Name)} ${JSON.stringify(this.Code)} ${JSON.stringify(this.Authority)} ${JSON.stringify(this.StringValue)}>`;
  }
}
