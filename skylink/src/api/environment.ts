import {FolderEntry} from './entries/FolderEntry.ts';
import {PathFragment} from './path-fragment.ts';
import {FunctionDevice} from '../devices/function-device.ts';
import {LiteralDevice} from '../devices/literal-device.ts';
import { SkyDevice, SkyEntry } from "../types.ts";
import { EnumerationWriter } from "./enumeration.ts";
import { Entry, ErrorEntry } from "./entries/index.ts";

// An environment maintains one mount table, similar to a plan9 namespace
// Generally one Environment is equivilent to one HTTP Origin
// (that is, it doesn't handle differing hostnames or protocols)

// bind() puts devices in, getEntry() gets entries from devices. (both async)
// Use pathTo() to select a subpath as a new Environment.
// - Future bind() calls cascade _down_ the selectPath() tree, but not up.
// - You can never walk out of any Environment, so this also works for access scoping.

export class Environment {
  constructor(
    public baseUri = 'env:',
  ) {}
  devices = new Map<string, SkyDevice>();
  prefixes = new Set<string>();

  // introduce a new device at a path
  async bind(target: string, device: SkyDevice) {
    if (!device.getEntry) throw new Error(
      `bind() only accepts devices, that is, getEntry() is required`);

    if (!target.endsWith('/')) {
      //console.warn('bind() wants a trailing slash for target now')
      //target += '/';
    }
    if (target.length && !target.startsWith('/')) throw new Error(
      `Environment#bind() only accepts absolute mount paths`);

    if (device.ready)
      await device.ready;

    // TODO: better handling of the fact that paths must round-trip
    target = target.replace(' ', '%20');

    //if (this.devices.has(target))
    //  throw new Error(`Environment refusing to replace device at ${target}`);
    this.devices.set(target, device);

    // record the new prefixes
    if (target.length !== 0) {
      var pathSoFar = target.slice(0, target.lastIndexOf('/'));
      while (true) {
        this.prefixes.add(pathSoFar);
        if (pathSoFar.length === 0) break;
        pathSoFar = pathSoFar.slice(0, pathSoFar.lastIndexOf('/'));
      }
    }

    //console.debug('bound', device, 'at', target);
  }

  pathTo(path: string) {
    if (path == '/') path = '';
    return new ChildEnvironment(this, path);
  }

  // launches a new device with opts, and binds it at path
  // kinda like a linux 'mount' command
  //
  // you should probably just make the device yourself and bind it.
  mount(path: string, type: 'bind'|'function'|'literal', opts: any) {
    opts = opts || {};
    //console.log('Mounting', type, 'to', path, 'with', opts);

    // initialize the device to be mounted
    var mount;
    switch (type) {
      case 'bind':
        mount = opts.source;
        break;
      case 'function':
        console.error('WARN: replace #mount(.., "function", ..) with #bind(.., new FunctionDevice(..)), old syntax will be removed. Note that options are the same.');
        mount = new FunctionDevice(opts);
        break;
      case 'literal':
        console.error('WARN: replace #mount(.., "literal", ..) with #bind(.., new LiteralDevice(..)), old syntax will be removed. Note that options have changed.');
        mount = LiteralDevice.ofString(opts.string);
        break;
      default: throw new Error(
        `bad mount type ${type} for ${path}`);
    }

    return this.bind(path, mount);
  }

  // returns the MOST specific mount for given path
  matchPath(path: string) {
    var pathSoFar = path;
    while (true) {
      if (this.devices.has(pathSoFar)) {
        return {
          mount: this.devices.get(pathSoFar),
          subPath: path.slice(pathSoFar.length),
        };
      }
      if (pathSoFar.length === 0) break;
      pathSoFar = pathSoFar.slice(0, pathSoFar.lastIndexOf('/'));
    };
    return {};
  }

  async getEntry(path: string, required?: boolean, apiCheck?: string): Promise<SkyEntry|null> {
    if (path === '/') path = '';
    path = path.replace(/ /g, '%20'); // TODO: better handling of this

    var entry;
    const {mount, subPath} = this.matchPath(path);
    if (mount && mount.getEntry && subPath != null) {
      entry = await mount.getEntry(subPath);
    }

    // show our root if we have to
    // TODO: support a mount to / while adding mounted children, if any?
    if (entry == null && this.prefixes.has(path)) {
      return new VirtualEnvEntry(this, path);
    }

    if (required && entry == null) throw new Error(
      `getEntry(${JSON.stringify(path)}) failed but was marked required`);

    if (apiCheck && entry != null && (entry as Record<string,unknown>)[apiCheck] == null) throw new Error(
      `getEntry(${JSON.stringify(path)}) found a ${entry.constructor.name} which doesn't present desired API ${apiCheck}`);

    return entry ?? null;
  }

  [Symbol.for("nodejs.util.inspect.custom")]() {
    const mountNames = new Array();
    this.devices.forEach((_, key) => mountNames.push(key));
    return `<Environment [${mountNames.join(' ')}]>`;
  }
};

export class ChildEnvironment extends Environment {
  constructor(parent: Environment | ChildEnvironment, selfPath: string) {
    super(parent.baseUri + selfPath);

    // copy existing parents
    this.parentEnvs = new Array<{env: Environment, subPath: string}>();
    const parentChild = parent as ChildEnvironment;
    if (parentChild.parentEnvs) {
      parentChild.parentEnvs.forEach(({env, subPath}) => {
        this.parentEnvs.push({env,
          subPath: subPath+selfPath,
        });
      });
    }

    // add the most-direct parent
    this.parentEnvs.unshift({
      env: parent,
      subPath: selfPath,
    });

    if (this.parentEnvs.length > 5)
      console.warn(`WARN: ChildEnvironment has a parent stack more than 5 deep`);
  }
  parentEnvs: { env: Environment; subPath: string; }[];

  async getEntry(path: string, required?: boolean, apiCheck?: string) {
    if (path.includes('..')) throw new Error(
      `Directory traversal not impl yet`);

    const localEnt = await super.getEntry(path, false, apiCheck);
    if (localEnt != null) return localEnt;
    for (const {env, subPath} of this.parentEnvs) {
      const parentEnt = await env.getEntry(subPath+path, false, apiCheck);
      if (parentEnt != null) return parentEnt;
    }

    if (required) throw new Error(
      `ChildEnvironment getEntry() didn't find anything for requirement ${path} even with ${this.parentEnvs.length} parent envs`);
    return null;
  }
}

// Returns fake container entries that lets the user find the actual content
export class VirtualEnvEntry implements SkyEntry {
  constructor(env: Environment, path: string) {
    console.log('Constructing virtual entry for', path);
    this.env = env;

    if (path === '/') {
      this.path = '';
    } else {
      this.path = path;
    }
  }
  env: Environment;
  path: string;

  async get() {
    const children = new Array();
    this.env.devices.forEach((mount, path) => {
      if (path.startsWith(this.path)) {
        const subPath = path.slice(this.path.length + 1);
        if (!subPath.includes('/')) {
          children.push({Name: subPath}); // TODO: add Type from child root
        }
      }
    });
    this.env.prefixes.forEach(prefix => {
      if (prefix.startsWith(this.path)) {
        const subPath = prefix.slice(this.path.length + 1);
        if (!subPath.includes('/')) {
          children.push({Name: subPath, Type: 'Folder'});
        }
      }
    });

    if (children.length) {
      const nameParts = this.path.split('/');
      const name = this.path ? nameParts[nameParts.length - 1] : 'root';
      return new FolderEntry(name, []); // TODO: include children here
    } else throw new Error(
      `BUG: You pathed into a part of an env with no contents`);
  }

  async enumerate(enumer: EnumerationWriter) {
    const myPath = PathFragment.parse(this.path);

    const children = new Array();
    const seenParts = new Set();

    this.env.devices.forEach((mount, path) => {
      const it = PathFragment.parse(path);
      if (it.startsWith(myPath) && it.count() === myPath.count() + 1) {
        children.push({
          name: it.lastName(),
          entry: mount.getEntry(''),
        });
        seenParts.add(it.lastPart());
      }
    });

    this.env.prefixes.forEach(prefix => {
      const it = PathFragment.parse(prefix);
      if (it.startsWith(myPath) && it.count() === myPath.count() + 1 && !seenParts.has(it.lastPart())) {
        children.push({
          name: it.lastName(),
          entry: new VirtualEnvEntry(this.env, prefix),
        });
        seenParts.add(it.lastPart());
      }
    });

    if (!children.length) {
      console.warn(`VirtualEnvEntry#enumerate() called when shouldn't be possible`);
      return;
    }

    enumer.visit(new FolderEntry(''));
    if (enumer.canDescend()) {
      for (const child of children) {
        enumer.descend(child.name);
        try {
          const rootEntry = await child.entry;
          if (!rootEntry) throw new Error(
            `Root entry was null`);

          // TODO: awaiting foreign enumerations can cause deadlocks
          // consider how we can have timeouts here
          if (rootEntry.enumerate) {
            await rootEntry.enumerate(enumer);
          } else if (rootEntry.get) {
            enumer.visit(await rootEntry.get());
          } else throw new Error(
            `Environment found a device that it can't describe`);

        } catch (err) {
          // console.warn('Enumeration had a failed node @', JSON.stringify(child.name), err);
          enumer.visit(new ErrorEntry(child.Name, err.name, import.meta.url, err.message));
        }
        enumer.ascend();
      }
    }
  }
}
