// TODO: this is its own thing that doesn't really fit the other devices
// should probably use a builder pattern instead of double-duty

import { Entry } from "../api/entries/index.ts";
import {FolderEntry} from '../api/entries/FolderEntry.ts';
import {StringEntry} from '../api/entries/StringEntry.ts';
import {FlatEnumerable} from '../api/enumeration.ts';
import {Environment} from '../api/environment.ts';
import { SkyDevice, SkyEntry } from "../types.ts";

export class PlatformApi implements SkyDevice<PlatformApiNode> {
  constructor(
    public name: string,
  ) {
    // this gets filled in at .compile()
    this.structType = new PlatformApiTypeFolder(name);
  }
  paths = new Map<string,PlatformApiNode>();
  env = new Environment();
  structType: PlatformApiTypeFolder;

  getter(path: string, type: PlatformApiType, impl) {
    // TODO: better handling of the fact that paths must round-trip
    path = path.replace(' ', '%20');

    const baseName = decodeURIComponent(path.slice(1).split('/').slice(-1)[0]);
    const device = new PlatformApiGetter(this, baseName, type, impl);
    this.paths.set(path, device);
    this.env.bind(path, device);
    return this;
  }
  function(path: string, args) {
    // TODO: better handling of the fact that paths must round-trip
    path = path.replace(' ', '%20');

    const baseName = decodeURIComponent(path.slice(1).split('/').slice(-1)[0]);
    const device = new PlatformApiFunction(this, baseName, args);
    this.paths.set(path, device);
    this.env.bind(path, device);
    return this;
  }

  // build the data structure which is used to transfer APIs by-value
  compile() {
    console.log('Compiling', name);
    const fields = [];
    for (let [path, entry] of this.paths) {
      if (entry.constructor === PlatformApiGetter) {
        // TODO: nesting!
        fields.push(entry.type);
      }
    }
    this.structType.fields = fields;
  }

  // flattens the API into a JavaScript-style object
  construct(self) {
    var obj = {};
    this.paths.forEach((val, path) => {
      const key = path.slice(1).replace(/ [a-z]/, x => x[1].toUpperCase(1));
      switch (val.constructor) {
        case PlatformApiFunction:
          obj[key] = input => val.impl.call(self, input);
          break;
        case PlatformApiGetter:
          obj[key] = () => val.impl.call(self);
          break;
        default: throw new Error(
          `PlatformApi had path of weird constructor ${val.constructor}`);
      }
    });
  }

  getEntry(path) {
    return this.env.getEntry(path);
  }
}

export class PlatformApiGetter implements SkyDevice<PlatformApiGetter>, SkyEntry {
  constructor(self: PlatformApi, name: string, type, impl) {
    this.self = self;
    this.type = platformApiTypeFrom(type, name);
    this.impl = impl.bind(this);
    // this.get = this.get.bind(this);
  }
  get = async (self=this.self) => {
    const x = await this.impl.call(self);
    return this.type.serialize(x);
  }
  getEntry(path: string) {
    if (path.length === 0) return Promise.resolve(this);
    throw new Error(`Getters don't have any children`);
  }
}

export class PlatformApiFunction implements SkyDevice, SkyEntry {
  constructor(self, name, {input, output, impl}) {
    this.self = self;
    this.inputType = platformApiTypeFrom(input, 'input');
    this.outputType = platformApiTypeFrom(output, 'output');
    this.impl = impl;
    this.invoke = this.invoke.bind(this);
  }
  invoke(input, self=this.self) {
    return Promise
      .resolve(this.impl.call(self, this.inputType.deserialize(input)))
      .then(x => ({
        get: () => this.outputType.serialize(x),
      }));
  }
  async getEntry(path: string) {
    switch (path) {
      case '':
        return new FlatEnumerable(
          new StringEntry('input'),
          new StringEntry('output'),
          {Type: 'Function', Name: 'invoke'});
      case '/input':
        return { get: () => new StringEntry('input', JSON.stringify(this.inputType)) };
      case '/output':
        return { get: () => new StringEntry('output', JSON.stringify(this.outputType)) };
      case '/invoke':
        return this;
    }
    return null;
  }
}

type PlatformApiNode =
| PlatformApiGetter
| PlatformApiFunction
;

type PlatformApiType =
| PlatformApiTypeFolder
| PlatformApiTypeJs
| PlatformApiTypeNull
| PlatformApiTypeString
| PlatformApiTypeString<number>
| PlatformApiTypeString<boolean>
;

export class ExtendableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = (new Error(message)).stack;
    }
  }
}

export class PlatformTypeError extends ExtendableError {
  constructor(
    public fieldName: string,
    public expectedType: string,
    public actualType: string,
  ) {
    super(`API field ${JSON.stringify(fieldName)} is supposed to be type ${expectedType} but was actually ${actualType}`);
  }
}

export class PlatformApiTypeString<Tval=string> {
  constructor(name: string, defaultValue: Tval | null, ser: (val: Tval) => string, de: (val: string) => Tval) {
    this.name = name;
    this.defaultValue = defaultValue;
    this.ser = ser;
    this.de = de;
  }
  name: string;
  type = 'String' as const;
  defaultValue: Tval | null;
  ser: (val: Tval) => string;
  de: (val: string) => Tval;

  serialize(value: Tval | null) {
    if (value == null)
      value = this.defaultValue;
    if (value == null) return null;
    return new StringEntry(this.name, this.ser(value));
  }
  deserialize(literal: Entry) {
    if (!literal) {
      if (this.defaultValue != null)
        return this.defaultValue;
      throw new PlatformTypeError(this.name, 'String', 'Empty');
    }
    if (literal.Type !== 'String')
      throw new PlatformTypeError(this.name, 'String', literal.Type);
    return this.de(literal.StringValue);
  }
}

export class PlatformApiTypeNull {
  constructor(
    public name: string,
  ) {}
  type = "Null" as const;
  serialize(value: null) {
    if (value != null) throw new Error(
      `Null type can't serialize anything other than null`);
    return null;
  }
  deserialize(literal: Entry) {
    if (literal != null) throw new Error(
      `Null type can't deserialize anything other than null`);
    return null;
  }
}

// Never put this on the network, it's a no-op, only for intra-process message passing.
export class PlatformApiTypeJs {
  constructor(
    public name: string,
  ) {}
  type = "JS" as const;
  serialize(value: Entry) {
    return value;
  }
  deserialize(literal: Entry) {
    return literal;
  }
}

export class PlatformApiTypeFolder {
  constructor(
    public name: string,
    public fields: Array<PlatformApiType> = [],
  ) {}
  type = "Folder" as const;
  serialize(value: Record<string,unknown>): Entry {
    return new FolderEntry(this.name, this.fields
        .map(field => field.serialize(value[field.name]))
        .flatMap(x => x ? [x] : []));
  }
  deserialize(literal: Entry) {
    if (!literal) throw new Error(
      `Folder ${
        JSON.stringify(this.name)
      } is required`);
    if (literal.Type !== 'Folder')
      throw new PlatformTypeError(this.name, 'Folder', literal.Type);

    const {Children} = literal;
    const struct = {};
    const givenKeys = new Set(Children.map(x => x.Name));
    for (const field of this.fields) {
      givenKeys.delete(field.name);
      const child = Children.find(x => x.Name === field.name);
      // TODO: transform struct keys for casing
      struct[field.name] = field.deserialize(child);
    }
    if (givenKeys.size !== 0) throw new Error(
      `Folder ${
        JSON.stringify(this.name)
      } had extra children: ${
        Array.from(givenKeys).join(', ')
      }`);

    return struct;
  }
}

export function platformApiTypeFrom(source: null | Function | number | string | boolean | PlatformApi | symbol, name: string): PlatformApiType {
  if (source == null)
    return new PlatformApiTypeNull(name);

  // recognize a constructor vs. a literal default-value
  const sourceIsBareFunc = typeof source === 'function';
  const typeFunc = typeof source === 'function' ? source : source.constructor;
  const givenValue = typeof source === 'function' ? null : source;

  //console.log('schema', name, 'type', typeFunc, 'default', givenValue);
  switch (typeFunc) {

    // string-based literals
    case String:
      return new PlatformApiTypeString(name, givenValue as string,
          String,
          String);
    case Number:
      return new PlatformApiTypeString(name, givenValue as number,
          String,
          parseFloat);
    case Boolean:
      return new PlatformApiTypeString(name, givenValue as boolean,
          b => b ? 'yes' : 'no',
          s => s === 'yes' ? true : false); // TODO: null?

    // nested data structures
    case Object: // TODO: better way to detect structures
      if (sourceIsBareFunc) {
        // blackbox objects become JSON strings lol fite me
        return new PlatformApiTypeString(name, {},
            JSON.stringify,
            JSON.parse);
      } else if (givenValue) {
        const fields = Object
            .keys(givenValue)
            .map(name => PlatformApiType
                .from(givenValue[name], name));
        return new PlatformApiTypeFolder(name, fields);
      }
      break;

    case PlatformApi:
      if (sourceIsBareFunc) throw new Error(
        `PlatformApi must be passed as a created instance`);
      return (givenValue as PlatformApi).structType;

    case Symbol:
      switch (givenValue) {
        case Symbol.for('raw js object'):
          return new PlatformApiTypeJs(name);

      }
  }
  throw new Error(
    `Unable to implement type for field ${JSON.stringify(name)}`);
}
