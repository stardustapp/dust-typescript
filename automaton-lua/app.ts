import { AutomatonBuilder } from "../client-automaton/builder.ts";
import { LuaRuntime } from "./app-runtime.ts";

new AutomatonBuilder<LuaRuntime>()
  .withMount('/source', `file://${Deno.args[2] ?? 'routines'}`)
  .withMount('/config', `session:/config/${Deno.args[0]}`)
  .withMount('/my-routes', `session:/persist/${Deno.args[0]}`)
  .withMount('/state', 'temp://')
  .withRuntimeConstructor(LuaRuntime)
  .withServicePublication(Deno.args[1])
  .launch();
