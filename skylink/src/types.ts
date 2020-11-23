import { Channel } from "./api/channel.ts";
import { Entry, FolderEntry } from "./api/entries/index.ts";
import { SkylinkClient } from "./client.ts";

export interface WireRequest {
  Op: string;
  Path?: string;
  Dest?: string;
  Input?: WireType;
  Depth?: number;

  _after?(): void;
}
export interface SkyRequest {
  Op: string;
  Path?: string;
  Dest?: string;
  Input?: Entry;
  Depth?: number;
}

export interface WireResponse {
  Ok: boolean;
  Output?: WireType;
  Chan?: number;
  Status?: string;

  _after?(): void;
}
export interface SkyResponse {
  Ok: boolean;
  Output?: Entry;
  Status?: string;
}


export interface WireTypeString {
  Name?: string;
  Type: "String";
  StringValue?: string;
}
export interface WireTypeBlob {
  Name?: string;
  Type: "Blob";
  Mime?: string;
  Data?: string;
}
export interface WireTypeFolder {
  Name?: string;
  Type: "Folder";
  Children?: WireType[];
}
export interface WireTypeFunction {
  Name?: string;
  Type: "Function";
}
export interface WireTypeError {
  Name?: string;
  Type: "Error";
  StringValue?: string;
  Code?: string;
  Authority?: string;
}
export interface WireTypeUnknown {
  Name?: string;
  Type: string;
  // Type: Exclude<string,"String" | "Blob" | "Folder" | "Error" | "Device">;
  // [key: string]: unknown;
}

export type WireType =
| WireTypeString
| WireTypeBlob
| WireTypeFolder
| WireTypeFunction
| WireTypeError
// | WireTypeUnknown
;


export type Invocable<TInput, TOutput> = {
  invoke(input: TInput): Promise<TOutput>;
};

export interface SkyDevice<T=SkyEntry> {
  getEntry(path: string): Promise<T | null> | T | null;
  ready?: Promise<unknown>;
}
export interface SkyEntry {
  get?(): Promise<Entry|null>;
  put?(input: Entry|null): Promise<void>;
  invoke?(input: Entry|null): Promise<Entry|null>;
  enumerate?(enumer: EnumerationWriter): Promise<void>;
  subscribe?(Depth: number, newChan: Invocable<(c: ServerChannel) => void,Channel>): Promise<Channel> | null;
}

export interface SkylinkExtension<T> {
  attachTo(client: T): void;
}


export interface ServerChannel {
  next(Output?: Entry): void;
  error(Output?: Entry): void;
  done(Output?: Entry): void;
  onStop(cb: () => void): void;
}


export interface EnumerationWriter {
  visit(literal: Entry): EnumerationWriter;
  canDescend(): boolean;
  remainingDepth(): number;

  descend(name: string): EnumerationWriter;
  ascend(): EnumerationWriter;

  // Transclude an external enumeration at the current visitation point
  // TODO: catch over-walking, and something else i forget
  visitEnumeration(entry: Entry): void;

  toOutput(): FolderEntry;

  // Converts the completed enumeration output into a NSAPI literal structure
  reconstruct(): Entry;
}
