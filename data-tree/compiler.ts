import * as Elements from './elements/_index.ts';
import {TreeNode, BaseElement} from './elements/_base.ts';
import {parseAbsolutePath} from './path-parser.ts';

import {Compiler as CompilerInterface, Schema, CompiledApp, FieldSpec, FieldDictSpec} from "./types.ts";

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
