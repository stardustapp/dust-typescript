import { DeviceEntry, Environment, FolderEntry, SkylinkClientDevice, SkylinkServer, StringEntry } from '../skylink/src/mod.ts';

import {ApiHandle} from './api-handle.ts'
import { ApiSession } from "./api-session.ts";
import { createUserEnvironment, UserMount } from './user-env.ts'

export class Automaton<T extends AutomatonRuntime> {
  constructor(
    public apiSession: ApiSession,
    public userEnv: Environment,
  ) {
    this.envServer = new SkylinkServer(userEnv);
  }
  runtime!: T;
  envServer: SkylinkServer;

  publishRuntimeEnvironment(serviceName: string) {
    if (!this.runtime.env) throw new Error(`No runtime environment found to publish`);
    return this.apiSession.wsDevice
      .getEntry('/publish%20service/invoke')
      .invoke(
        new FolderEntry('Publication', [
          new StringEntry('Session ID', this.apiSession.sessionId),
          new StringEntry('Service ID', serviceName),
          new DeviceEntry('Ref', this.runtime.env),
        ]));
  }

  getHandle(path: string) {
    return new ApiHandle(this.envServer, path);
  }

}

export interface AutomatonRuntime {
  // constructor(userEnv: Environment): this;
  runNow(): Promise<unknown>;
  env?: Environment;
}

export class AutomatonBuilder<T extends AutomatonRuntime> {
  constructor() {}
  osEnv: Record<string,string> | null = null;
  userMounts = new Array<UserMount>();

  servicePubId?: string;
  runtimeFactory?: (self: Automaton<T>) => T;

  withHostEnvironment(osEnv: Record<string,string>) {
    this.osEnv = osEnv;
    return this;
  }
  withMount(envPath: string, sourceUrl: string) {
    this.userMounts.push({mount: envPath, target: sourceUrl});
    return this;
  }
  withMounts(mountList: Iterable<UserMount>) {
    for (const entry of mountList) {
      this.userMounts.push(entry);
    }
    return this;
  }
  withRuntimeFactory(factoryFunc: (self: Automaton<T>) => T) {
    this.runtimeFactory = factoryFunc;
    return this;
  }
  withRuntimeConstructor(constrFunc: new (self: Automaton<T>) => T) {
    this.runtimeFactory = self => new constrFunc(self);
    return this;
  }
  withServicePublication(serviceId: string) {
    this.servicePubId = serviceId;
    return this;
  }

  async launch() {
    if (!this.runtimeFactory) throw new Error(`BUG: No runtime factory registered!`);

    try {
      // get a session with the user's auth server
      const apiSession = await ApiSession.findFromEnvironment(this.osEnv ?? Deno.env.toObject());
      console.group(); console.group();

      // set up namespace that the script has access to
      const userEnv = await createUserEnvironment(apiSession, this.userMounts);

      console.groupEnd(); console.groupEnd();
      console.log('==> Starting automaton');
      console.log();

      const automaton = new Automaton<T>(apiSession, userEnv);
      automaton.runtime = this.runtimeFactory(automaton);

      if (this.servicePubId) {
        console.log(`--> Publishing our API surface as "${this.servicePubId}"...`);
        await automaton.publishRuntimeEnvironment(this.servicePubId);
      }

      await automaton.runtime.runNow();

      console.error();
      console.error('!-> Automaton completed.');
      Deno.exit(0);
    } catch (err) {
      console.error();
      console.error('!-> Automaton crashed:');
      console.error(err.stack || err);
      Deno.exit(1);
    }
  }
}
