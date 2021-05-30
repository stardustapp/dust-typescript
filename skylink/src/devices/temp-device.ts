import { Entry, ErrorEntry, FolderEntry } from "../api/entries/index.ts";
import { SkyDevice, SkyEntry } from "../types.ts";

export class TempDevice implements SkyDevice<TempEntry> {
  constructor() {}
  entries = new Map<string,SkyEntry>();

  getEntry(path: string) {
    if (path === '/') return new TempEntry(this, '');
    return new TempEntry(this, path);
  }
}

export class TempEntry implements SkyEntry {
  constructor(public mount: TempDevice, public path: string) {}

  async get() {
    const entry = this.mount.entries.get(this.path);
    if (entry) {
      // if (entry.Type) return entry;
      if (entry.get) return entry.get();
      throw new Error(`get() called but wasn't a gettable thing`);
    }

    const prefix = this.path ? `${this.path}/` : '/';
    const matches = Array.from(this.mount.entries).filter(x => x[0].startsWith(prefix));
    if (this.path == '' || matches.length > 0) {
      const childDirs = new Set<string>();
      const childEnts = new Map<string,SkyEntry>();
      for (const match of matches) {
        const name = match[0].slice(prefix.length);
        if (name.includes('/')) {
          childDirs.add(name.slice(0, name.indexOf('/')-1));
        } else {
          childEnts.set(name, match[1]);
        }
      }

      const children = await Promise.all(Array
        .from(childEnts)
        .map(async x => x[1].get
          ? (await x[1].get()
            ?? new ErrorEntry(x[0], 'null-child', import.meta.url, `Child was null`))
          : new ErrorEntry(x[0], 'no-get-method', import.meta.url, `Child isn't gettable`)));

      return new FolderEntry('temp', children.concat(Array
        .from(childDirs).map(x => new FolderEntry(x))));
    }

    return null;
  }

  async invoke(input: Entry) {
    const entry = this.mount.entries.get(this.path);
    if (!entry) return null;
    if (entry.invoke) return entry.invoke(input);
    throw new Error(`invoke() called but wasn't a invokable thing`);
  }

  async put(value: Entry) {
    this.mount.entries.set(this.path, {
      get: () => Promise.resolve(value),
    });
  }
}

// old impl
// this one is just a dressed up Environment, which is less ideal, I think

// const {Environment} = require('../api/environment.ts');
//
// TempDevice extends Environment {
//   constructor(opts) {
//     super('tmp:');
//   }
//
//   async getEntry(path) {
//     return new TempEntry(this, path, await super.getEntry(path));
//   }
// }
//
// class TempEntry {
//   constructor(mount, path, upperEnv) {
//     this.mount = mount;
//     this.path = path;
//     this.upperEnv = upperEnv;
//   }
//
//   async get() {
//     if (this.upperEnv)
//       return this.upperEnv.get();
//   }
//
//   async invoke(input) {
//     if (this.upperEnv)
//       return this.upperEnv.invoke(input);
//   }
//
//   async enumerate(enumer) {
//     if (this.upperEnv)
//       return this.upperEnv.enumerate(enumer);
//   }
//
//   async put(value) {
//     if (this.path.length>1 && this.upperEnv)
//       return this.upperEnv.put(value);
//
//     console.log('putting', this.path, value);
//     return this.mount.bind(this.path, value);
//   }
// }
