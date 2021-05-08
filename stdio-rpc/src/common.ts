const symbolMark = Symbol.for("dust/stdio-rpc");

export function enforceMark(input: Deno.Reader, output: Deno.Writer) {
  // Really try to prevent reuse, because it's always a bug
  if (symbolMark in input) throw new Error(`Can only make one RPC socket per input stream`);
  if (symbolMark in output) throw new Error(`Can only make one RPC socket per output stream`);
  Object.defineProperty(input, symbolMark, { enumerable: false, value: "input" });
  Object.defineProperty(output, symbolMark, { enumerable: false, value: "output" });
}
