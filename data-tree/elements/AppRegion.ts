import { FieldSpec } from "../types.ts";
import {BaseTreeParentElement, TreeNode} from './_base.ts';

export class AppRegion extends BaseTreeParentElement {
  constructor(
    public regionName: string,
    childPaths: Record<string, FieldSpec>,
  ) {
    super('Folder', childPaths);
  }

  static family = "AppRegion";
  get config() {
    return {
      regionName: this.regionName,
    };
  }
}
