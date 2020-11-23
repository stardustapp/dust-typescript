import {BlobEntry} from './BlobEntry.ts';
import {DeviceEntry} from './DeviceEntry.ts';
import {FolderEntry} from './FolderEntry.ts';
import {StringEntry} from './StringEntry.ts';
import {ErrorEntry} from './ErrorEntry.ts';

export type NilEntry = {
  Name: string;
  Type?: undefined;
};

export type UnknownEntry = {
  Name?: string;
  Type: string;
};

export class FunctionEntry {
  Type = "Function" as const;
  constructor(
    public Name: string,
  ) {}
}

export {
  BlobEntry,
  DeviceEntry,
  FolderEntry,
  StringEntry,
  ErrorEntry,
};
// TODO: rename CoreEntry (put Entry in types.ts)
export type Entry =
| BlobEntry
| DeviceEntry
| FolderEntry
| StringEntry
| ErrorEntry
| NilEntry
| FunctionEntry
;

export {InflateSkylinkLiteral} from './_inflate.ts';
export {DeflateToSkylinkLiteral} from './_deflate.ts';
