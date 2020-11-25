import { Entry, EnumerationWriter, FolderEntry, SkylinkServer, StringEntry } from '../skylink/src/mod.ts';

function nullIfNotFound(err: Error) {
  if (err.message.includes('Path not found')) return null; // @dustjs/backend-firebase
  if (err.message.includes(`wasn't Ok, and no error`)) return null; // legacy golang
  throw err;
}

export class ApiHandle {
  constructor(api: SkylinkServer, path: string) {
    Object.defineProperties(this, {
      api:  { value: api,  enumerable: false },
      path: { value: path, enumerable: true  },
    });
  }
  api!: SkylinkServer;
  path!: string;

  subPath(path: string | TemplateStringsArray, ...names: string[]) {
    // support being used by template literals
    if (!(typeof path === 'string')) {
      path = String.raw(path, ...names.map(encodeURIComponent))
    }

    // TODO?: use PathFragment
    if (!path.startsWith('/')) throw new Error(
      `BUG: must use absolute paths when pathing an ApiHandle`);
    return new ApiHandle(this.api, this.path + path);
  }

  enumerateChildren({ Depth=1 }={}) { return this.api
    .performOperation({ Op: 'enumerate', Path: this.path, Depth })
    .then(x => {
      if (x?.Type !== 'Folder') throw new Error(
        `BUG: enumerate() returned type ${x?.Type}`);
      return x.Children.filter(x => x.Name);
    })
    .catch(nullIfNotFound); }

  enumerateToLiteral({ Depth=1 }={}) { return this.api
    .performOperation({ Op: 'enumerate', Path: this.path, Depth })
    .then(enumLit => {
      if (enumLit?.Type !== 'Folder') throw new Error(
        `BUG: enumerate() returned type ${enumLit?.Type}`);
      const enumer = new EnumerationWriter(Depth);
      enumer.visitEnumeration(enumLit);
      return enumer.reconstruct();
    }); }

  readString() { return this.api
    .performOperation({ Op: 'get', Path: this.path })
    .then(x => (x && x.Type === 'String') ? (x.StringValue || '') : null)
    .catch(nullIfNotFound); }
  readBoolean() { return this.readString()
    .then(str => str === 'yes' || (str === 'no' ? false : null)); }

  storeString(StringValue='') { return this.api
    .performOperation({ Op: 'store',
      Dest: this.path,
      Input: new StringEntry('', StringValue),
    }); }
  storeFolder(Children: Entry[]) { return this.api
    .performOperation({ Op: 'store',
      Dest: this.path,
      Input: new FolderEntry('', Children),
    }); }
  storeLiteral(literal: Entry) { return this.api
    .performOperation({ Op: 'store',
      Dest: this.path,
      Input: literal,
    }); }

  invoke(Input?: Entry) { return this.api
    .performOperation({ Op: 'invoke',
      Path: this.path,
      Input,
    }); }
  invokeWithChildren(Children: Entry[]=[]) { return this.api
    .performOperation({ Op: 'invoke',
      Path: this.path,
      Input: new FolderEntry('', Children),
    }); }
}
