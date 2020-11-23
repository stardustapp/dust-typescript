import { Entry } from "./index.ts";
import {FolderEntry} from './entries/FolderEntry.ts';
import {StringEntry} from './entries/StringEntry.ts';
import { Channel } from "./channel.ts";
import { Invocable, ServerChannel, SkyEntry, WireType } from "../types.ts";

export class EnumerationWriter {
  constructor(
    public depth: number,
  ) {}
  entries = new Array<Entry>(); // log of nodes we've visited
  names = new Array<string>(); // stack of where we're walking. .join('/')

  visit(literal: Entry) {
    literal.Name = this.names.map(encodeURIComponent).join('/');
    this.entries.push(literal);
    return this;
  }

  canDescend() {
    return this.names.length < this.depth;
  }
  remainingDepth() {
    return this.depth - this.names.length;
  }

  descend(name: string) {
    this.names.push(name);
    return this;
  }
  ascend() {
    if (this.names.length === 0) throw new Error(
      `BUG: EnumerationWriter ascended above its root`);
    this.names.pop();
    return this;
  }

  // Transclude an external enumeration at the current visitation point
  // TODO: catch over-walking, and something else i forget
  visitEnumeration(entry: Entry) {
    if (entry.Type !== 'Folder') throw new Error(
      `This isn't a Folder!`);
    if (entry.Name !== 'enumeration') throw new Error(
      `This isn't an enumeration!`);

    const enumPrefix = this.names.map(encodeURIComponent).join('/');
    for (const literal of entry.Children ?? []) {
      if (enumPrefix) {
        literal.Name = enumPrefix + (literal.Name ? ('/' + literal.Name) : '');
      }
      this.entries.push(literal);
    }
  }

  toOutput() {
    if (this.names.length > 0) throw new Error(
      `BUG: EnumerationWriter asked to serialize, but is still descended`);
    // return {Type: 'Folder', Name: 'enumeration', Children: this.entries};
    return new FolderEntry('enumeration', this.entries)
  }

  // Converts the completed enumeration output into a NSAPI literal structure
  reconstruct() {
    if (this.names.length > 0) throw new Error(
      `BUG: EnumerationWriter asked to reconstruct, but is still descended`);

    const outputStack = new Array<Entry>();
    for (const entry of this.entries) {
      const parts = (entry.Name ?? '').split('/');
      if (entry.Name === '')
        parts.pop(); // handle root-path case

      while (parts.length < outputStack.length) {
        outputStack.pop();
      }
      if (parts.length === outputStack.length) {
        entry.Name = decodeURIComponent(parts[parts.length-1] || '');
        const parent = outputStack[outputStack.length - 1]
        if (parent) {
          if (parent.Type !== 'Folder') throw new Error(
            `enumerate put something inside a non-folder ${parent.Type}`);
          parent.Children.push(entry);
        }
        outputStack.push(entry);
        if (entry.Type === 'Folder' && !entry.Children) {
          entry.Children = [];
        }
      }
    }
    return outputStack[0];
  }
}


// Provides a shitty yet complete non-reactive subscription
// Gets its data from the provided enumeration lambda
// Shuts down the channel when it's down as a signal downstream
export function EnumerateIntoSubscription(
  enumHandler: (enumer: EnumerationWriter) => Promise<void> | void,
  depth: number,
  newChannel: Invocable<(c: ServerChannel) => void,Channel>
) {
  return newChannel.invoke(async c => {
    const enumer = new EnumerationWriter(depth);
    const enumeration = await enumHandler(enumer);
    for (const entry of enumer.toOutput().Children) {
      const fullName = entry.Name;
      entry.Name = 'entry';
      c.next(new FolderEntry('notif', [
        new StringEntry('type', 'Added'),
        new StringEntry('path', fullName),
        entry,
      ]));
    }
    c.next(new FolderEntry('notif', [
      new StringEntry('type', 'Ready'),
    ]));
    c.error(new StringEntry('nosub',
      `This entry does not implement reactive subscriptions`));
  });
}

export class FlatEnumerable implements SkyEntry {
  list: Entry[];
  constructor(...things: Entry[]) {
    this.list = things.slice(0);
  }

  async get() {
    return new FolderEntry('enumerable', this.list);
  }
  async enumerate(enumer: EnumerationWriter) {
    enumer.visit(new FolderEntry(''));
    if (!enumer.canDescend()) return;
    for (const child of this.list) {
      enumer.descend(child.Name);
      const childAsEntry = child as SkyEntry;
      if (enumer.canDescend() && childAsEntry.enumerate) {
        await childAsEntry.enumerate(enumer);
      } else if (childAsEntry.get) {
        const childLit = await childAsEntry.get();
        if (childLit) enumer.visit(childLit);
      } else {
        enumer.visit(child);
      }
      enumer.ascend();
    }
  }
}
