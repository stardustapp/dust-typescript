import type { Automaton, AutomatonRuntime } from "../client-automaton/builder.ts";
import { Environment, StringEntry, LiteralDevice, FunctionDevice, Entry } from '../skylink/src/mod.ts';

import { LuaMachine, LuaThread } from './lib/lua-machine.ts';

export class LuaRuntime implements AutomatonRuntime {
  status: string;
  userEnv: Environment;

  env: Environment;
  machine?: LuaMachine;
  thread?: LuaThread;

  constructor(automaton: Automaton<LuaRuntime>) {
    this.status = 'Pending';
    // this.processes = new Array; // TODO: skylink api
    this.userEnv = automaton.userEnv;

    // set up the skylink API for a runtime
    this.env = new Environment;
    this.env.bind('/app-name', LiteralDevice.ofString('TODO'));
    this.env.bind('/namespace', this.userEnv);
    // this.env.bind('/processes', {getEntry(){}});
    this.env.bind('/restart', new FunctionDevice(async function (input) {
        // const {idToken, appId} = input;
        console.log('TODO: restarting runtime', input);
        return new StringEntry('out', 'todo');
      }));
    this.env.bind('/start-routine', new FunctionDevice(async function invoke(input: Entry | null) {
        // const {idToken, appId} = input;
        console.log('TODO: starting routine', input);
        return new StringEntry('out', 'todo');
      }));
    this.env.bind('/state', { getEntry: (path: string) => this.getStateEntry(path) });

  }

  async runNow(input=null) {
    this.machine = new LuaMachine(this.userEnv);
    this.thread = this.machine.startThread();

    const sourceEntry = await this.userEnv.getEntry('/source/launch.lua');
    if (!sourceEntry) throw new Error(
      `Failed to access the /source device. Did you mount it?`)

    // if (sourceEntry.subscribe) {
    //   const rawSub = await sourceEntry.subscribe();
    //   await new Promise(resolve => {
    //     const sub = new SingleSubscription(rawSub);
    //     sub.forEach(literal => {
    //       this.thread.compileFrom(literal);

    //       resolve && resolve();
    //       resolve = null;
    //     });
    //   });
    // } else {
      const literal = await sourceEntry.get?.();
      if (literal?.Type !== 'Blob') throw new Error(`Needed a Blob, got a ${literal?.Type}`);
      this.thread.compileFrom(literal);
    // }

    await this.thread.run(input);
  }

  async getStateEntry(path: string) {
    if (path) throw new Error(
      `literal devices have no pathing`);
    return {
      // TODO: probably impl subscribe() lol
      get: () => {
        return Promise.resolve(new StringEntry('state', this.status));
      },
    };
  }
}
