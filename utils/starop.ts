import {
  Entry,
  EnumerationWriter,
  InflateSkylinkLiteral,
  interpretUrl,
} from "../skylink/src/mod.ts";
import {readAll} from "https://deno.land/std@0.95.0/io/util.ts";

const [client, path] = interpretUrl(Deno.args[1] ?? '/');

switch (Deno.args[0]) {

  case 'get': {
    const entry = await client.performOp({
      Op: 'get',
      Path: path,
    });
    switch (entry?.Type) {
      case 'Blob':
        const isText = entry.Mime.startsWith('text/') || entry.Mime.includes('utf-8');
        if (isText) {
          console.log(new TextDecoder('utf-8').decode(entry.asBytes()));
        } else if (!Deno.isatty(Deno.stdout.rid) || prompt(`This might be a binary file (${entry.Mime}), print anyway?`)) {
          await Deno.stdout.write(entry.asBytes());
        }
        break;
      default:
        console.log(entry);
    }
    break;
  }

  case 'tree': {
    const listing = await client.performOp({
      Op: 'enumerate',
      Path: path,
      Depth: parseInt(Deno.args[2] || '4'),
    });
    if (listing?.Type !== 'Folder') {
      console.log(listing);
      break;
    }
    console.log('Contents of', Deno.args[1] ?? '/', ':');
    for (const item of listing.Children) {
      switch (item.Type) {
        case 'Folder':
          console.log(' ', item.Name + '/');
          break;
        case 'String':
          console.log(' ', item.Name, "\t\t:", JSON.stringify(item.StringValue));
          break;
        case 'Function':
          console.log(' ', item.Name + '()');
          break;
        default:
          console.log(' ', item.Name, `(${item.Type})`);
          break;
      }
    }
    break;
  }

  case 'ls':
    const listing = await client.performOp({
      Op: 'enumerate',
      Path: path,
      Depth: 1,
    });
    if (listing?.Type !== 'Folder') {
      console.log(listing);
      break;
    }
    const enumer = new EnumerationWriter(1);
    enumer.visitEnumeration(listing);

    const output = enumer.reconstruct();
    if (output.Type !== 'Folder') {
      console.log(output);
      break;
    }

    console.log('Contents of', Deno.args[1] ?? '/', ':');
    for (const item of output.Children) {
      switch (item.Type) {
        case 'Folder':
          console.log(' ', item.Name + '/');
          break;
        case 'String':
          console.log(' ', item.Name);
          break;
        case 'Function':
          console.log(' ', item.Name + '()');
          break;
        default:
          console.log(' ', item.Name, `(${item.Type})`);
          break;
      }
    }
    break;

  case 'invoke': {
    const input = InflateSkylinkLiteral(JSON.parse(new TextDecoder().decode(await readAll(Deno.stdin))));
    printFullEntry(input);
    console.log('Invocation triggered...');
    const output = await client.performOp({
      Op: 'invoke',
      Path: path,
      Input: input,
    });
    console.log('Result:');
    printFullEntry(output);
    break;
  }

}


function printFullEntry(entry: Entry | undefined, indentStr = ' ') {
  const prefix = indentStr.slice(0, -1);
  if (!entry) {
    console.log(prefix+'- ', '(missing entry)');
    return;
  }
  switch (entry.Type) {

    case 'Folder':
      console.log(prefix+'+-.', entry.Name+'/');
      const last = entry.Children.slice(-1)[0];
      for (const child of entry.Children) {
        printFullEntry(child, indentStr+(last == child ? '  ' : ' |'));
      }
      break;

    case 'String':
      console.log(prefix+'|- ', entry.Name, " \t:", JSON.stringify(entry.StringValue).slice(0, 80));
      break;

    case 'Function':
      console.log(prefix+'|- ', entry.Name + '()');
      break;

    default:
      console.log(prefix+'|- ', entry.Name, `(${entry.Type})`);
  }
}
