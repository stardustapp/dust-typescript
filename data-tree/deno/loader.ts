import { join, resolve, basename } from 'https://deno.land/std@0.95.0/path/mod.ts';

import { Compiler } from '../compiler.ts';
import * as El from '../elements/_index.ts'; // we give this to the schemas
import { RawElement } from "../types.ts";

export class SchemaLoader {
  constructor(
    public baseDir: string,
  ) {}
  schemas = new Map<string, {
    sourcePath: string;
    metadata: any;
    roots: RawElement[];
  }>();

  async loadAllInDirectory(schemaDir: string) {
    const realSchemaDir = resolve(this.baseDir, schemaDir);
    for await (const file of Deno.readDir(realSchemaDir)) {
      const fileName = file.name;
      const name = basename(fileName, '.mjs');
      if (name === fileName) continue;

      if (this.schemas.has(name)) {
        console.error(`WARN: schema ${name} was already loaded once (additional version being loaded from ${realSchemaDir})`);
      }

      console.log('Loading app schema', name, '...');
      const fullPath = join(realSchemaDir, fileName);
      const {metadata, builder} = await import(fullPath);
      const roots = new Array<RawElement>();
      builder(El, (root: RawElement) => roots.push(root));
      // console.log(metadata, roots);

      // const {Compiler} = await import('@dustjs/data-tree');
      // const compiler = new Compiler({
      //   target: 'firestore',
      //   pathParser(path) {
      //     return PathFragment.from(path);
      //   },
      //   // TODO
      //   // stackValidator(stack) {
      // });

      // const dataTree = compiler.compile(schema);
      this.schemas.set(name, {
        sourcePath: fullPath,
        metadata,
        roots,
      });
      // await firebase.registerApplication(name, );
    }

  }

  compileAll(compileOpts: {
    target: string,
  }) {
    const compiler = new Compiler(compileOpts);

    const compiled = new Map;
    for (const [name, model] of this.schemas) {
      compiled.set(name, compiler.compile(model));
    }

    // console.log('-->', inspect(compiled, {
    //   showHidden: false, depth: null, colors: true}));
    return compiled;
  }
}
