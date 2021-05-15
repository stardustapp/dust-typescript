import { FieldSpec } from "../types.ts";
import {BaseTreeParentElement, TreeNode} from './_base.ts';

export class Document extends BaseTreeParentElement {
  constructor(fieldsSpec: Record<string, FieldSpec>) {
    super('Document', fieldsSpec);
  }

  static family = "Document";
}
