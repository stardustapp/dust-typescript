import {Compiler, FieldSpec, RawNode, RawElement, FieldDictSpec} from "../types.ts";

export class TreeNode<T = FieldSpec> implements RawNode {
  constructor(
    public family: string,
    public config: T,
  ) {}
}

export class BaseElement implements RawElement {
  static family = "TODO";
  get config() {
    return {};
  }

  makeNode(compiler: Compiler) {
    return new TreeNode(
      (this.constructor as any).family,
      this.config);
  }
}

export class BaseParentElement extends BaseElement {
  constructor(
    public childSpec: FieldSpec,
  ) {
    super();
  }

  makeNode(compiler: Compiler) {
    return new TreeNode(
      (this.constructor as any).family,
      {
        ...this.config,
        inner: compiler.mapChildSpec(this.childSpec),
      });
  }
}

type TreeParentNode = TreeNode<{
  names: Map<string, TreeNode>;
}>;

export class BaseTreeParentElement extends BaseElement {
  constructor(
    public virtualFamily: string,
    public childPaths: FieldDictSpec,
  ) {
    super();
  }

  makeNode(compiler: Compiler) {
    const {family} = this.constructor as unknown as {family: string};

    const nameMap = new Map<string,TreeParentNode>();
    for (const path in this.childPaths) {
      const pathNames = compiler.pathParser(path);
      const innerNode = compiler.mapChildSpec(this.childPaths[path]);
      if (pathNames.length === 0) throw new Error(
        `BUG: ${family} given zero-length child path "${path}"`);

      let currMap: Map<string,TreeParentNode|RawNode> = nameMap;
      while (pathNames.length > 1) {
        const nextName = pathNames.shift()!;
        if (!currMap.has(nextName)) {
          currMap.set(nextName, new TreeNode(this.virtualFamily, {
            names: new Map,
          }));
        }

        const currItem = currMap.get(nextName);
        if (currItem?.family !== this.virtualFamily) throw new Error(
          `BUG: ${family} found non-${this.virtualFamily} trying to store path "${path}"`);
        currMap = (currItem.config as any).names;
        if (currMap.constructor !== Map) throw new Error(
          `BUG: ${family} found non-Map trying to store path "${path}"`);
      }

      const lastName = pathNames.shift()!;
      if (currMap.has(lastName)) throw new Error(
        `BUG: ${family} found existing item where path "${path}" goes`);
      currMap.set(lastName, innerNode);
    }

    return new TreeNode(
      family, {
        ...this.config,
        names: nameMap,
      });
  }
}
