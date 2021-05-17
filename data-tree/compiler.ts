import * as Elements from './elements/_index.ts';
import {TreeNode, BaseElement} from './elements/_base.ts';
import {parseAbsolutePath} from './path-parser.ts';

import {Compiler as CompilerInterface, Schema, CompiledApp, FieldSpec, FieldDictSpec, RawNode, RawElement} from "./types.ts";

export class Compiler implements CompilerInterface {
  target: string;
  constructor(opts: {
    target: string,
  }) {
    this.target = opts.target;
  }
  pathParser = parseAbsolutePath;

  compile(app: Schema): CompiledApp {
    return {
      ...app,
      roots: app.roots.map(root => {
        return root.makeNode(this);
      }),
      getAppRegion(name) {
        return this.roots.find(x =>
          x.family === 'AppRegion' &&
          (x.config as any).regionName === name);
      },
    };
  }

  async importAndCompileAndExport(moduleUrl: string) {
    const {metadata, builder} = await import(moduleUrl);

    const roots = new Array<RawElement>();
    builder(Elements, (root: RawElement) => roots.push(root));

    const compiled = this.compile({
      sourcePath: moduleUrl,
      metadata,
      roots,
    });

    return {
      ...compiled,
      roots: compiled.roots.map(exportNode),
    };
  }

  mapChildSpec(childSpec: FieldSpec): TreeNode<unknown> {
    if (childSpec instanceof BaseElement) {
      return childSpec.makeNode(this);
    } else if (childSpec instanceof Symbol) {
      return new Elements.Meta(childSpec.description!).makeNode(this);
    } else if (childSpec.constructor === Object) {
      return new Elements.Document(childSpec as FieldDictSpec).makeNode(this);
    } else if (Array.isArray(childSpec) && childSpec.length === 1) {
      return new Elements.List(childSpec[0]).makeNode(this);
    } else if (String === childSpec || Number === childSpec) {
      return new Elements.Primitive(childSpec).makeNode(this);
    } else if (Date === childSpec || Boolean === childSpec) {
      return new Elements.Primitive(childSpec).makeNode(this);
    } else throw new Error(
      `TODO: Compiler#mapChildSpec default case`);
  }
}

export function exportNode(input: RawNode): unknown {
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
