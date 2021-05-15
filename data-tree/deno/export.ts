import { join, resolve, basename } from 'https://deno.land/std@0.95.0/path/mod.ts';

import * as El from '../elements/_index.ts'; // we give this to the schemas
import { Compiler } from '../compiler.ts';
import { RawElement, RawNode } from "../types.ts";

async function render(fullPath: string, compileOpts: {target: string}) {
  // TODO: better way to get Deno.cwd() as a URL?
  const fullUrl = fullPath.includes('://') ? fullPath : resolve(Deno.cwd(), fullPath);
  const {metadata, builder} = await import(fullUrl);
  const roots = new Array<RawElement>();
  builder(El, (root: RawElement) => roots.push(root));

  const schema = {
    sourcePath: fullPath,
    metadata,
    roots,
  };

  const compiler = new Compiler(compileOpts);
  const compiled = compiler.compile(schema);

  return {
    ...compiled,
    roots: compiled.roots.map(exportNode),
  };
}

// type BasicNode = {
//   names?: Map<string,BasicNode>;
//   inner?: BasicNode;
// };
function exportNode(input: RawNode): unknown {
  const config = input.config as Record<string,unknown>;
  const nameMap = config.names as Map<string, RawNode> | undefined;
  const inner = config.inner as RawNode | undefined;
  return {
    ...config,
    family: input.family,
    names: nameMap?.constructor === Map ? Array.from(nameMap).map(x => [x[0], exportNode(x[1])] as const) : undefined,
    inner: inner ? exportNode(inner) : undefined,
  };
}

if (import.meta.main) {
  console.log(JSON.stringify(await render(Deno.args[0], {
    target: 'deno',
  }), null, 0));
}
