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

  case 'enum': {
    const listing = await client.performOp({
      Op: 'enumerate',
      Path: path,
      Depth: parseInt(Deno.args[2] || '4'),
    });
    if (listing) {
      printFullEntry(listing);
    } else {
      console.log('No result from enumeration');
    }
  } break;

  case 'tree':
  case 'ls': {
    const listing = await client.performOp({
      Op: 'enumerate',
      Path: path,
      Depth: parseInt(Deno.args[2] || (Deno.args[0] == 'tree' ? '4' : '1')),
    });
    if (listing?.Type !== 'Folder') {
      console.log(listing);
      break;
    }
    const enumer = new EnumerationWriter(1);
    enumer.visitEnumeration(listing);

    const output = enumer.reconstruct();
    output.Name = path;
    printFullEntry(output);
  } break;

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


function printFullEntry(entry: Entry | undefined, indentStr1 = '', indentStr2 = '') {
  if (!entry) {
    console.log(indentStr1, '(missing entry)');
    return;
  }
  switch (entry.Type) {

    case 'Folder':
      console.log(indentStr1 + entry.Name+'/');
      const last = entry.Children.slice(-1)[0];
      for (const child of entry.Children) {
        printFullEntry(child,
          indentStr2+(last == child ? '└── ' : '├── '),
          indentStr2+(last == child ? '    ' : '│   '),
        );
      }
      break;

    case 'String':
      console.log(indentStr1 + entry.Name, " \t:", JSON.stringify(entry.StringValue).slice(0, 80));
      break;

    case 'Error':
      console.log(indentStr1 + entry.Name, "(Error)");
      if (entry.Code) console.log(indentStr2+'│', `error code:`, JSON.stringify(entry.Code));
      console.log(indentStr2+'│', `error message:`, JSON.stringify(entry.StringValue).slice(0, 80));
      if (entry.Authority) console.log(indentStr2+'│', `authority:`, JSON.stringify(entry.Authority));
      break;

    case 'Blob':
      console.log(indentStr1 + entry.Name, ` \t${entry.Mime} | ${entry.Data.length} B`);
      break;

    case 'Function':
      console.log(indentStr1 + entry.Name + '()');
      break;

    default:
      console.log(indentStr1 + entry.Name, `(${entry.Type})`);
  }
}
