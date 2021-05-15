import { FieldSpec } from "../types.ts";
import {BaseParentElement} from './_base.ts';

export class DatePartitionedLog extends BaseParentElement {
  constructor(
    childSpec: Record<string, FieldSpec>,
    public hints: Record<string, unknown> = {},
  ) {
    super(childSpec);
  }

  static family = "PartitionedLog";
  get config() {
    return {
      partitionBy: 'Date',
      innerMode: 'AppendOnly',
      hints: this.hints,
    };
  }

}
