import { FolderEntry, StringEntry } from "../../skylink/src/api/index.ts";
import { SpawnRpcTenant } from '../src/host.ts';

for (const _ of new Array(5).fill(null)) {
  const d0 = Date.now();

  const tenant = await SpawnRpcTenant(new URL('./math-tenant.ts', import.meta.url).toString());

  // await tenant.device.getEntry('/tmp/uptime').put(new StringEntry('', '0'));

  // const enumeration = await tenant.skylink.volley({Op: 'enumerate', Path: '/', Depth: 2});
  // console.log('enum:', (enumeration.Output as any).Children);

  const result = await tenant.device.getEntry('/api/add/invoke').invoke(new FolderEntry('', [
    new StringEntry('1', '5'),
    new StringEntry('2', '6'),
  ]));
  if (result?.Type !== 'String') {
    throw new Error(`Expected String, got ${result?.Type}`);
  }
  if (result.StringValue !== '11') {
    throw new Error(`Expected 11, got ${result.StringValue}`);
  }

  tenant.skylink.stop();
  await tenant.exitStatus;

  const dt = Date.now() - d0;
  console.log(dt, 'ms');
}
