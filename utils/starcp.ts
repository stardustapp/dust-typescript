import {Entry, EnumerationWriter, FolderEntry, interpretUrl, SkylinkClient} from "../skylink/src/mod.ts";

const [client1, path1] = interpretUrl(Deno.args[0] ?? '/');
const [client2, path2] = interpretUrl(Deno.args[1] ?? '/');

const listing1 = await client1.performOp({
  Op: 'enumerate',
  Path: path1,
  Depth: parseInt(Deno.args[2] || '8'),
});
if (listing1?.Type !== 'Folder') {
  throw new Error(`BUG: Enumeration wasn't a Folder`)
}

// Add encoding to all text blobs
for (const item of listing1.Children) {
  if (item.Type !== 'Blob') continue;
  if (!item.Mime.startsWith('text/')) continue;
  if (item.Mime.includes(';')) continue;
  item.Mime += '; charset=utf-8';
}

const enumer = new EnumerationWriter(1);
enumer.visitEnumeration(listing1);

const output = enumer.reconstruct();
if (output.Type !== 'Folder') {
  throw new Error(`BUG: Root wasn't a Folder`)
}

await considerForCopy(output, client2, path2);

async function considerForCopy(entry: FolderEntry, destClient: SkylinkClient, destPath: string) {
  const childTypes = new Set(entry.Children.map(x => x.Type));
  if (childTypes.size == 0) return;
  if (childTypes.size == 1 && childTypes.has('Folder')) {
    for (const child of entry.Children as FolderEntry[]) {
      await considerForCopy(child, destClient, destPath+'/'+encodeURIComponent(child.Name));
    }
  } else {
    console.log('Writing', destPath, '...');
    await destClient.performOp({
      Op: 'store',
      Dest: destPath,
      Input: entry,
    });
  }
}
