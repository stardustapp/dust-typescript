import { Entry, FolderEntry, FunctionEntry } from "../api/entries/index.ts";
import { SkyDevice, SkyEntry } from "../types.ts";

export class FunctionDevice implements SkyDevice {
  constructor(
    public invokeCb: (input: Entry | null) => Promise<Entry | null>,
  ) {}

  async getEntry(path: string): Promise<SkyEntry> {
    switch (path) {
      case '':
        return {
          get: () => Promise.resolve(new FolderEntry('function', [
            new FunctionEntry(''),
          ])),
          async enumerate(enumer) {
            enumer.visit(new FolderEntry(''));
            if (enumer.canDescend()) {
              enumer.descend('invoke');
              enumer.visit(new FunctionEntry(''));
              enumer.ascend();
            }
          },
        };
      case '/invoke':
        return {
          get: () => Promise.resolve(new FunctionEntry('invoke')),
          invoke: this.invokeCb,
        };
      default:
        // TODO i guess
        throw new Error(`function devices only have /invoke`);
    }
  }
}
