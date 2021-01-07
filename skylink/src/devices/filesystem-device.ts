import { resolve } from 'https://deno.land/std@0.83.0/path/mod.ts';
import { BlobEntry, Entry, FolderEntry } from "../api/entries/index.ts";
import { SkyDevice, SkyEntry } from "../types.ts";

export class FilesystemDevice implements SkyDevice<FilesystemEntry> {
  constructor(fsRootPath: string) {
    this.fsRoot = resolve(fsRootPath);
  }
  fsRoot: string;

  getEntry(subPath: string) {
    const realPath = resolve(this.fsRoot, subPath.slice(1));
    if (realPath === this.fsRoot || realPath.startsWith(this.fsRoot+'/')) {
      return new FilesystemEntry(realPath);
    } else throw new Error(
      `Security Exception: FilesystemDevice refused subPath "${subPath}"`);
  }

  static fromUri(uri: string) {
    if (!uri.startsWith('file://')) throw new Error(
      `BUG: FilesystemDevice given non-file:// URI of scheme "${uri.split('://')[0]}"`);

    return new FilesystemDevice(uri.slice(7));
  }
}

export class FilesystemEntry implements SkyEntry {
  constructor(
    public fsPath: string,
  ) {}

  async get(): Promise<Entry> {
    const stat = await Deno.stat(this.fsPath);
    switch (true) {

      case stat.isFile:
        const data = await Deno.readFile(this.fsPath);
        return BlobEntry.fromBytes(data, 'application/octet-stream');

      case stat.isDirectory:
        return new FolderEntry('');

      default: throw new Error(
        `BUG: Stat of "${this.fsPath}" was unidentified`);
    }
  }

  // TODO: more filesystem operations
  // async enumerate(enumer) {
  // }
}
