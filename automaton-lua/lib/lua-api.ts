// @deno-types="./fengari.d.ts"
import fengari from "https://dev.jspm.io/npm:fengari-web@0.1.4/dist/fengari-web.bundle.js";
const {lua, lauxlib} = fengari;

import {
  StringEntry,
  EnumerationWriter,
  SkylinkClientDevice,
  LiteralDevice,
  FolderEntry,
  DeviceEntry,
  Environment,
  Entry,
  ChildEnvironment,
  BlobEntry,
} from '../../skylink/src/mod.ts';

import { mkdirp } from './mkdirp.ts';
import * as pollable from './pollable-devices.ts';
import Datadog from './datadog.ts';
import {CallTrace} from './tracing.ts';
import { SkyDevice, SkyEntry } from "../../skylink/src/types.ts";

type L = fengari.lua.lua_State;
type T = CallTrace;

export interface LuaContext {
  rootDevice: Environment | ChildEnvironment;
  compileLuaToStack(T: T, sourceText: string): void;
  readLuaEntry(T: T, index: number): Entry | DeviceEntry | null;
  pushDeviceReference(T: T, device: SkyDevice): void;
  pushLiteralEntry(T: T, entry: Entry | null): void;
  pushLuaTable(T: T, folder: FolderEntry): void;
  resolveLuaPath(T: T): {device: Environment | ChildEnvironment, path: string;};
};
export interface LuaMachine extends LuaContext {
  startThread(): LuaThread;
}
export interface LuaThread extends LuaContext {
  machine: LuaMachine;
  name: string;
  status: string;
  compileFrom(src: BlobEntry): void;
  run(input: Entry | null): void;
}

export const LUA_API: Record<string, (this: LuaThread, L: L, T: T) => Promise<number>> = {

  async startRoutine(L: L, T: T) {
    // ctx.startRoutine("dial-server", {network=network})

    const routineName = lua.lua_tojsstring(L, 1);

    const sourceEntry = await this.machine.rootDevice.getEntry('/source/'+routineName+'.lua');
    const source = await sourceEntry?.get?.() ?? null;
    if (source?.Type !== 'Blob') throw new Error(`startRoutine got Type=${source?.Type} instead of Type=Blob`);
    let input = null;

    if (lua.lua_gettop(L) >= 2 && lua.lua_istable(L, 2)) {
      T.log({text: "Reading Lua table for routine input", routine: routineName});
      input = this.readLuaEntry(T, 2);
    }

    const thread = this.machine.startThread();
    thread.compileFrom(source);
    const completion = thread.run(input);

    console.log("started routine", thread.name);
    // TODO: return routine's process
    return 0;
  },

  // ctx.mkdirp([pathRoot,] pathParts string...) Context
  async mkdirp(L: L, T: T) {
    const {device, path} = this.resolveLuaPath(T);
    T.log({text: `mkdirp to ${path}`});

    T.startStep({name: 'mkdirp'});
    await mkdirp(device, path);
    T.endStep();

    this.pushDeviceReference(T, device.pathTo(path));
    return 1;
  },

  // mkdirp but without the creation
  // ctx.chroot([pathRoot,] pathParts string...) Context
  async chroot(L: L, T: T) {
    const {device, path} = this.resolveLuaPath(T);
    T.log({text: `chroot to ${path}`});

    this.pushDeviceReference(T, device.pathTo(path));
    return 1;
  },

  // ctx.import(wireUri) Context
  async import(L: L, T: T) {
    const wireUri = lua.lua_tojsstring(L, 1);//.replace('10.8.0.5', '10.69.4.69'); // TODO
    lua.lua_pop(L, 1);
    this.status = "Waiting: Dialing " + wireUri;

    // TODO: support abort interruptions
    if (!wireUri.startsWith('skylink+'))
      throw new Error(`can't import that yet`);

    T.startStep({name: 'start network import', wireUri});
    const device = SkylinkClientDevice.fromUri(wireUri.replace('/::1', '/[::1]').replace('/pub/', '/'));
    await device.ready.then(() => {
      T.endStep();
      console.log("Lua successfully opened wire", wireUri);

      this.pushDeviceReference(T, device);
    }, err => {
      T.endStep();
      console.warn("failed to open wire", wireUri, err);
      lua.lua_pushnil(L);
    });

    return 1;
  },

  // ctx.subscribeOne([root,] pathParts string...) Context
  async subscribeOne(L: L, T: T) {
    const {device, path} = this.resolveLuaPath(T);
    T.startStep({name: 'lookup entry'});
    const entry = await device.getEntry(path);
    T.endStep();
    if (!entry) throw new Error(`Failed to find entry for subscribeOne()`);

    const subDevice = new pollable.PollableSubscribeOne();
    await subDevice.subscribeTo(entry);

    this.pushDeviceReference(T, subDevice);
    return 1;
  },

  // ctx.subscribe([root,] pathParts string..., depth int) Context
  async subscribeTree(L: L, T: T) {
    const depth = lauxlib.luaL_checknumber(L, -1);
    lua.lua_pop(L, 1);

    const {device, path} = this.resolveLuaPath(T);
    T.startStep({name: 'lookup entry'});
    const entry = await device.getEntry(path);
    T.endStep();
    if (!entry) throw new Error(`Cannot subscribeTree() here; nothing found`);

    const subDevice = new pollable.PollableTreeSubscription();
    await subDevice.subscribeTo(entry, depth);

    this.pushDeviceReference(T, subDevice);
    return 1;
  },

  // ctx.read([pathRoot,] pathParts string...) (val string)
  async read(L: L, T: T) {
    const {device, path} = this.resolveLuaPath(T);
    T.startStep({name: 'lookup entry'});
    const entry = await device.getEntry(path);
    T.endStep();

    if (entry && entry.get) {
      try {
        T.startStep({name: 'get entry'});
        const value = await entry.get();
        this.pushLiteralEntry(T, value || new StringEntry('missing', ''));
        T.endStep();
      } catch (err) {
        console.debug('read() failed to find string at path', path, err);
        lua.lua_pushliteral(L, '');
        T.endStep({extant: 'false'});
      }
      return 1;
    } else {
      T.log({text: `entry didn't exist or didn't offer a get()`});
    }

    console.debug('read() failed to find gettable string at path', path);
    lua.lua_pushliteral(L, '');
    return 1;
  },

  // ctx.readDir([pathRoot,] pathParts string...) (val table)
  async readDir(L: L, T: T) {
    const {device, path} = this.resolveLuaPath(T);
    T.startStep({name: 'lookup entry'});
    const entry = await device.getEntry(path, true);
    T.endStep();
    if (!entry) return 0;

    if (entry.enumerate) {
      const enumer = new EnumerationWriter(2); // TODO
      T.startStep({name: 'perform enumeration'});
      try {
        await entry.enumerate(enumer);
        T.endStep();
      } catch (err) {
        if (err.response.Ok === false) {
          console.warn('ctx.readDir() enumeration failed :(', err);
          lua.lua_pushnil(L);
          T.endStep();
          return 1;
        }
        throw err;
      }

      T.startStep({name: 'build lua result'});
      this.pushLiteralEntry(T, enumer.reconstruct());
      T.endStep();
      return 1;
    }

    throw new Error(`readDir() target wasn't enumerable`);
  },

  // ctx.store([pathRoot,] pathParts string..., thingToStore any) (ok bool)
  async store(L: L, T: T) {
    // get the thing to store off the end
    const value = this.readLuaEntry(T, -1);
    lua.lua_pop(L, 1);

    // make sure we're not unlinking
    if (value == null)
      throw new Error("store() can't store nils, use ctx.unlink()");

    // read all remaining args as a path
    const {device, path} = this.resolveLuaPath(T);

    T.startStep({name: 'lookup entry'});
    const entry = await device.getEntry(path);
    T.endStep();

    if (!entry?.put) throw new Error(`Cannot put here; not available`);

    // do the thing
    // console.log("store to", path, "of", value);
    T.startStep({name: 'put entry'});
    const ok = (await entry.put(value), true);
    lua.lua_pushboolean(L, ok);
    T.endStep();
    return 1;
  },

  // ctx.bind([pathRoot,] pathParts string..., device Context) (ok bool)
  async bind(L: L, T: T) {
    // get the thing to store off the end
    const value = this.readLuaEntry(T, -1);
    lua.lua_pop(L, 1);

    // make sure we're not unlinking
    if (value == null)
      throw new Error("store() can't store nils, use ctx.unlink()");

    if (value.Type !== 'Device') throw new Error(
      `TODO: Lua tried ctx.bind()ing a non-Context`);

    // read all remaining args as a path
    const {device, path} = this.resolveLuaPath(T);

    T.startStep({name: 'resolve root path'});
    let devicePath = path;
    if (device === this.rootDevice) {
      // console.log('bind() called on root device :)');
    } else if ('parentEnvs' in device) {
      const parentEnv = device.parentEnvs.find(p => p.env === this.rootDevice);
      if (parentEnv) {
        devicePath = parentEnv.subPath + devicePath;
      } else throw new Error(
        `ctx.bind() can only bind into locations derived from the local environment`);
    } else throw new Error(
      `ctx.bind() must be given a destination derived from the local environment`);
    T.endStep();

    T.startStep({name: 'perform bind'});
    console.log(devicePath);
    await this.rootDevice.bind(devicePath, value);
    T.endStep();

    lua.lua_pushboolean(L, true);
    return 1;
  },

  // ctx.invoke([pathRoot,] pathParts string..., input any) (output any)
  async invoke(L: L, T: T) {
    // get the thing to store off the end, can be nil
    const input = this.readLuaEntry(T, -1);
    lua.lua_pop(L, 1);

    T.startStep({name: 'resolve input'});
    const inputEnt = (input?.Type === 'Device' && typeof input.getEntry === 'function') ? await input.getEntry('') : input;
    const inputSky = inputEnt as SkyEntry;
    const inputLit = (inputSky && typeof inputSky.get === 'function') ? await inputSky.get() : inputEnt as Entry;
    T.endStep();

    // read all remaining args as a path
    const {device, path} = this.resolveLuaPath(T);
    console.debug("invoke of", path, 'from', path, 'with input', JSON.stringify(inputLit));
    T.startStep({name: 'lookup function entry'});
    const entry = await device.getEntry(path + '/invoke');
    T.endStep();

    if (!entry || !entry.invoke)
      throw new Error(`Tried to invoke function ${path} but did not exist or isn't invokable`);

    T.startStep({name: 'invoke function'});
    const output = await entry.invoke(inputLit);
    T.endStep();

    if (output) {
      this.pushDeviceReference(T, new LiteralDevice(output));
      return 1;
    }
    return 0;
  },

  // ctx.unlink([pathRoot,] pathParts string...) (ok bool)
  async unlink(L: L, T: T) {
    // read all args as a path
    const {device, path} = this.resolveLuaPath(T);
    T.startStep({name: 'lookup entry'});
    const entry = await device.getEntry(path);
    T.endStep();

    if (!entry?.put) throw new Error(`Cannot put here; not available`);

    // do the thing
    T.startStep({name: 'unlink entry'});
    const ok = (await entry.put(null), true);
    lua.lua_pushboolean(L, ok);
    T.endStep();
    return 1;
  },

  // ctx.enumerate([pathRoot,] pathParts string...) []Entry
  // Entry tables have: name, path, type, stringValue
  async enumerate(L: L, T: T) {
    const {device, path} = this.resolveLuaPath(T);

    T.startStep({name: 'get entry'});
    const enumer = new EnumerationWriter(1);
    const entry = await device.getEntry(path);
    if (!entry) {
      throw new Error(`Path not found: ${path}`);
    } else if (entry.enumerate) {
      T.startStep({name: 'perform enumeration'});
      await entry.enumerate(enumer);
      T.endStep();
    } else {
      throw new Error(`Entry at ${path} isn't enumerable`);
    }
    T.endStep();

    T.startStep({name: 'build lua result'});
    lua.lua_newtable(L); // entry array
    let idx = 0;
    enumer.entries.filter(x => x.Name).forEach((value, idx) => {
      lua.lua_newtable(L); // individual entry

      const baseName = decodeURIComponent(value.Name.split('/').slice(-1)[0]);
      lua.lua_pushliteral(L, baseName);
      lua.lua_setfield(L, 2, fengari.to_luastring("name"));
      lua.lua_pushliteral(L, value.Name);
      lua.lua_setfield(L, 2, fengari.to_luastring("path"));
      if (value.Type) {
        lua.lua_pushliteral(L, value.Type);
        lua.lua_setfield(L, 2, fengari.to_luastring("type"));
      }
      if (value.Type === 'String') {
        lua.lua_pushliteral(L, value.StringValue);
        lua.lua_setfield(L, 2, fengari.to_luastring("stringValue"));
      }

      lua.lua_rawseti(L, 1, idx+1);
    });
    T.endStep();
    return 1;
  },

  // ctx.log(messageParts string...)
  log(L: L, T: T) {
    const n = lua.lua_gettop(L);
    const parts = new Array(n);
    for (let i = 0; i < n; i++) {
      const type = lua.lua_type(L, i+1);
      switch (type) {
      case lua.LUA_TSTRING:
        parts[i] = fengari.to_jsstring(lauxlib.luaL_checkstring(L, i+1));
        break;
      case lua.LUA_TNUMBER:
        parts[i] = lauxlib.luaL_checknumber(L, i+1);
        break;
      case lua.LUA_TBOOLEAN:
        parts[i] = lua.lua_toboolean(L, i+1);
        break;
      case lua.LUA_TUSERDATA:
        const raw = lauxlib.luaL_checkudata(L, i+1, "stardust/root") as {root: Environment};
        const device = raw.root.baseUri;
        parts[i] = device;
        break;
      default:
        parts[i] = `[lua ${fengari.to_jsstring(lua.lua_typename(L, type))}]`;
      }
    }
    lua.lua_settop(L, 0);

    console.log("debug log:", ...parts);
    T.log({text: parts.join(' '), level: 'info'});
    return Promise.resolve(0);
  },

  // ctx.poll(pollables Table, timeoutSecs float) Table
  async poll(L: L, T: T) {
    if (lua.lua_gettop(L) !== 2) return lauxlib.luaL_error(L,
      fengari.to_luastring(`ctx.poll(pollables, seconds) requires 2 parameters`));

    // read arguments
    const seconds = lauxlib.luaL_checknumber(L, 2);
    const pollables = this.readLuaEntry(T, 1);
    lua.lua_settop(L, 0);

    if (pollables?.Type !== 'Folder') return lauxlib.luaL_error(L,
      fengari.to_luastring(`ctx.poll(pollables, seconds) requires a table as the first parameter`));

    // TODO
    // console.log('lua be tryin to poll', pollables, 'for', seconds, 'seconds');
    const d0 = Date.now();
    const readyFolder = await pollable.PerformPoll(pollables, Math.floor(seconds * 1000));
    const dT = (Date.now() - d0) / 1000;

    const readyNames = readyFolder.Children.map((x: Entry) => x.Name);
    // console.log('lua poll got back', readyNames, 'after', dT, 'seconds');
    Datadog.gauge('lua.poll_seconds', dT, {
      poll_ready: readyNames.join(':') || 'none',
    });

    this.pushLiteralEntry(T, readyFolder);
    return 1;
  },

  // ctx.interval(seconds float) Context
  // returns a Pollable
  async interval(L: L, T: T) {
    const secs = lauxlib.luaL_checknumber(L, 1);
    lua.lua_pop(L, 1);

    const timer = new pollable.PollableInterval(Math.floor(secs*1000));
    this.pushDeviceReference(T, timer);
    return 1;
  },

  // ctx.sleep(seconds float)
  // just blocks for that amount of time
  async sleep(L: L, T: T) {
    // TODO: support interupting to abort

    const secs = lauxlib.luaL_checknumber(L, 1);
    lua.lua_pop(L, 1);

    this.status = `Sleeping: Since ${new Date().toISOString()} for ${secs}s`;
    T.startStep({text: `sleeping ${secs}s`});
    const millis = Math.floor(secs*1000);
    await new Promise(ok => setTimeout(ok, millis));
    T.endStep();

    return 0;
  },

  // ctx.timestamp() string
  timestamp(L: L, T: T) {
    lua.lua_pushliteral(L, (new Date()).toISOString());
    return Promise.resolve(1);
  },

  // ctx.splitString(fulldata string, knife string) []string
  splitString(L: L, T: T) {
    const str = lua.lua_tojsstring(L, 1);
    const knife = lua.lua_tojsstring(L, 2);
    lua.lua_settop(L, 0);

    lua.lua_newtable(L);
    const parts = str.split(knife);
    for (let i = 0; i < parts.length; i++) {
      lua.lua_pushliteral(L, parts[i]);
      lua.lua_rawseti(L, 1, i + 1);
    }
    return Promise.resolve(1);
  },
};
