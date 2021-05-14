import { cmdApply } from './src/cmd-apply.ts';
import { cmdServe } from './src/cmd-serve.ts';

const [mode, ...args] = Deno.args;
switch (mode) {

  case 'apply': {
    await cmdApply(args).catch(showError);
    break;
  };

  case 'serve': {
    await cmdServe(args).catch(showError);
    break;
  };

  default: {
    console.log('commands:');
    console.log('  dust-deployer apply: roll out changes to the cloud');
    console.log('  dust-deployer serve: launch development server on localhost');
    // TODO: more
    Deno.exit(6);
  };
}

function showError(error: unknown) {
  console.log('!!! Fatal error occurred!\n');
  console.log((error as Error).stack);
  Deno.exit(2);
}
