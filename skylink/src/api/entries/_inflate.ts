import {BlobEntry} from './BlobEntry.ts';
import {DeviceEntry} from './DeviceEntry.ts';
import {FolderEntry} from './FolderEntry.ts';
import {StringEntry} from './StringEntry.ts';
import {ErrorEntry} from './ErrorEntry.ts';
import { WireType, WireTypeUnknown } from "../../types.ts";
import { Entry } from "./index.ts";

export function InflateSkylinkLiteral(raw: WireType, extraInflaters?: Map<string,(input: WireTypeUnknown) => Entry>): Entry {
  // if (!raw) return null;

  if (raw.constructor !== Object) throw new Error(
    `Raw skylink literal wasn't an Object, please read the docs`);
  if (typeof raw.Type !== 'string') return new ErrorEntry(raw.Name ?? '', 'missing-type', import.meta.url,
    `This Entry is missing its Type field`);
  switch (raw.Type) {

    case 'String':
      return new StringEntry(raw.Name ?? '', raw.StringValue);

    case 'Folder':
      if (!raw.Children) return new FolderEntry(raw.Name ?? '');
      return new FolderEntry(raw.Name ?? '', raw.Children
        .map(child => InflateSkylinkLiteral(child, extraInflaters))
        .flatMap(x => x ? [x] : []));

    case 'Blob':
      return new BlobEntry(raw.Name ?? '', raw.Data ?? '', raw.Mime ?? '');

    case 'Error':
      return new ErrorEntry(raw.Name ?? '', raw.Code ?? '', raw.Authority ?? '', raw.StringValue ?? '');

    // TODO: proper class (maybe even with a callable?)
    // case 'Function':
    //   return raw;
      // return new FunctionEntry(raw.Name || '');

    // case 'JS':
    //   return raw.Data;

    default:
      const mysterious = raw as WireTypeUnknown;
      const inflater = extraInflaters?.get(mysterious.Type);
      if (inflater) {
        const translated = inflater(mysterious);
        if (!translated || translated.Type !== mysterious.Type) throw new Error(
          `BUG: Inflater for ${mysterious.Type} returned ${translated ? translated.Type : 'nothing'}`);
        return translated;
      }

      console.log('WARN: inflater saw unhandled Type in', mysterious);
      return new ErrorEntry(mysterious.Name ?? '', 'unimpl-type', import.meta.url, `Skylink literal had unimpl Type ${mysterious.Type}, cannot deflate`);
  }
};
