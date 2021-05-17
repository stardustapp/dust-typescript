import { resolve } from 'https://deno.land/std@0.95.0/path/mod.ts';

import { Compiler } from '../compiler.ts';

export async function renderSchema(fullPath: string, compileOpts: {target: string}) {
  // TODO: better way to get Deno.cwd() as a URL?
  const fullUrl = fullPath.includes('://') ? fullPath : resolve(Deno.cwd(), fullPath);

  const compiler = new Compiler(compileOpts);
  return await compiler.importAndCompileAndExport(fullUrl);
}

if (import.meta.main) {
  console.log(JSON.stringify(await renderSchema(Deno.args[0], {
    target: 'deno',
  }), null, 0));
}
