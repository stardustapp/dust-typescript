import {EnumerationWriter, interpretUrl} from "../skylink/src/mod.ts";
import {prompt} from "https://crux.land/3aKrZ4#terminal-input@v1";

const [client, path] = interpretUrl(Deno.args[0] ?? '/');

let line: string | null;
while ((line = prompt('>')) != null) {
  console.log(JSON.stringify(line));
}
console.log(JSON.stringify(line));
