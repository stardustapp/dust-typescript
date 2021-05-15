export interface Schema {
  sourcePath: string;
  metadata: unknown;
  roots: RawElement[];
}
export interface CompiledApp {
  sourcePath: string;
  metadata: unknown;
  roots: RawNode[];
  getAppRegion(name: string): RawNode | undefined;
}

export interface Compiler {
  compile(app: Schema): CompiledApp;
  mapChildSpec(childSpec: FieldSpec): RawNode;
  pathParser(string: string): string[];
}

export interface RawNode {
  family: string;
  config: unknown;
}

export interface RawElement {
  // family: string;
  // readonly config: Record<string, unknown>;
  makeNode(compiler: Compiler): RawNode;
}

export type FieldDictSpec = {
  [key: string]: FieldSpec;
};
export type FieldSpec =
| [FieldSpec]
| RawElement
| FieldDictSpec
| Function
| Symbol
| StringConstructor
| NumberConstructor
| DateConstructor
| BooleanConstructor
;
