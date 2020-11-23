import { Entry, NilEntry } from "./index.ts";

export class FolderEntry {
  Type = "Folder" as const;
  constructor(
    public Name: string,
    public Children: (Entry | NilEntry)[] = [],
  ) {}

  append(child: Entry) {
    if (typeof child === 'string') {
      this.Children.push({Name: child});
    } else {
      this.Children.push(child);
    }
  }

  // Helper to fetch one direct descendant, with optional useful checking
  getChild(name: string, required?: boolean, typeCheck?: string) {
    const child = this.Children.find(x => x.Name === name);
    if (required && (!child || !child.Type)) {
      throw new Error(`getChild(${JSON.stringify(name)}) on ${JSON.stringify(this.Name)} failed but was marked required`);
    }
    if (typeCheck && child && child.Type !== typeCheck) {
      throw new Error(`getChild(${JSON.stringify(name)}) on ${JSON.stringify(this.Name)} found a ${child.Type} but ${typeCheck} was required`);
    }
    return child;
  }

  // inspect() {
  //   const childStr = this.Children.map(x => x ? (x.inspect ? x.inspect() : `${x.constructor.name} "${x.Name}"`) : `BUG:NULL`).join(', ');
  //   return `<Folder ${JSON.stringify(this.Name)} [${childStr}]>`;
  // }
}
