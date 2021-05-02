import { AutomatonBuilder } from "../client-automaton/builder.ts";
import { LuaRuntime } from "./app-runtime.ts";

// dynamically configured entrypoint for apps to use lua
// accepts options like:
// --app irc
// --service irc-automaton
// --/irc-modem skylink+http://irc-modem
// --/coinbase-api skylink+http://coinbase-api-client

import { parse } from "https://deno.land/std@0.95.0/flags/mod.ts";
const args = parse(Deno.args, {
  boolean: 'default-mounts',
  default: { 'default-mounts': true },
});

const builder = new AutomatonBuilder<LuaRuntime>()
  .withRuntimeConstructor(LuaRuntime);

if (args['default-mounts'] !== false) builder
  .withMount('/source', `file://${args['routines-dir'] ?? 'routines'}`)
  .withMount('/config', `session:/config/${args['app'] ?? 'lua'}`)
  .withMount('/persist', `session:/persist/${args['app'] ?? 'lua'}`)
  .withMount('/state', 'temp://');

if (args['service']) builder
  .withServicePublication(args['service']);

for (const pair of Object.entries(args).filter(x => x[0][0] === '/')) builder
  .withMount(pair[0], pair[1]);

builder.launch();
