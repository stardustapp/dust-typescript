import { Environment, FunctionDevice, LiteralDevice, StringEntry, TempDevice } from "../../skylink/src/mod.ts";
import { RpcTenant } from "../src/tenant.ts";

const env = new Environment();
env.bind('/tmp', new TempDevice());
env.bind('/info', new LiteralDevice(new StringEntry('info', 'up')));

env.bind('/api/add', new FunctionDevice(async input => {
  if (input?.Type !== 'Folder') throw new Error('Need Folder input');
  const result = input.Children.reduce((sum, next) => {
    if (next.Type !== 'String') throw new Error('Can only add Strings with numbers');
    return sum + parseFloat(next.StringValue);
  }, 0);
  return new StringEntry('result', result.toFixed());
}));

env.bind('/api/multiply', new FunctionDevice(async input => {
  if (input?.Type !== 'Folder') throw new Error('Need Folder input');
  const result = input.Children.reduce((sum, next) => {
    if (next.Type !== 'String') throw new Error('Can only add Strings with numbers');
    return sum * parseFloat(next.StringValue);
  }, 1);
  return new StringEntry('result', result.toFixed());
}));

env.bind('/api/sqrt', new FunctionDevice(async input => {
  if (input?.Type !== 'String') throw new Error('Need String input');
  const num = parseFloat(input.StringValue);
  return new StringEntry('result', Math.sqrt(num).toFixed());
}));

env.bind('/api/power', new FunctionDevice(async input => {
  if (input?.Type !== 'Folder') throw new Error('Need Folder input w/ base and exponent');
  const base = parseFloat(input.getStringChild('base', true));
  const exponent = parseFloat(input.getStringChild('exponent', true));
  return new StringEntry('result', Math.pow(base, exponent).toFixed());
}));

const host = new RpcTenant(env);
await host.runLoop();
console.log('Math Tenant is done');
