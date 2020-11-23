import {PathFragment} from '../api/path-fragment.ts';
import {StringEntry} from '../api/entries/StringEntry.ts';
import { Entry, FolderEntry } from "../api/entries/index.ts";
import { EnumerationWriter, SkyDevice, SkyEntry } from "../types.ts";

// Read-only Device that just lets you poke at an Entry or skylink literal
// Most useful with Folder entries but also works with strings etc
export class LiteralDevice implements SkyDevice<LiteralEntry> {
  constructor(
    public rootLiteral: Entry,
  ) {}

  static ofString(value: string) {
    const literal = new StringEntry('literal', value);
    return new LiteralDevice(literal);
  }

  async getEntry(rawPath: string) {
    if (this.rootLiteral === null) {
      return null;
    }
    if (rawPath === '' || rawPath === '/') {
      return new LiteralEntry(this.rootLiteral);
    }

    const path = PathFragment.parse(rawPath);
    let entry: Entry | null = this.rootLiteral;

    for (const name of path.names) {
      if (entry.Type === 'Folder' && entry.Children) {
        entry = entry.Children.find(x => x.Name === name) ?? null;
      // } else if (entry.getEntry) {
      //   return entry.TODO
      } else {
        entry = null;
      }
      if (!entry) throw new Error(
        `getEntry("${rawPath}") missed at "${name}"`);
    }

    return new LiteralEntry(entry);
  }
}

export class LiteralEntry implements SkyEntry {
  constructor(
    public literal: Entry,
  ) {}

  get() {
    return Promise.resolve(this.literal);
  }

  enumerate(enumer: EnumerationWriter) {
    if (this.literal.Type === 'Folder') {
      enumer.visit(new FolderEntry(''));
      if (enumer.canDescend()) {
        for (const child of this.literal.Children) {
          enumer.descend(child.Name);
          new LiteralEntry(child).enumerate(enumer);
          enumer.ascend();
        }
      }
    } else {
      enumer.visit(this.literal);
    }
    return Promise.resolve();
  }
}
