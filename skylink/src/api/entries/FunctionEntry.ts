export class FunctionEntry {
  Type = "Function" as const;
  constructor(
    public Name: string,
  ) {
  }

  inspect() {
    return `<Function ${JSON.stringify(this.Name)}>`;
  }
}
