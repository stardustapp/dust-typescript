import {
  clr,
  combine,
  iter,
  readableStreamFromReader,
  readerFromIterable,
} from "../deps.ts";

const KnownDirs = new Array<[string,string]>();

const signals = [
  Deno.signal(Deno.Signal.SIGINT),
  Deno.signal(Deno.Signal.SIGTERM),
];
export function disregardSignals() {
  signals.forEach(x => x.dispose());
  signals.length = 0;
}
const cleaningUp = Promise.race(signals).then(disregardSignals);

export class ServiceRunner {
  constructor(cwd?: string) {
    this.cwd = cwd || Deno.cwd();
    cleaningUp.then(this.onInterrupt);
  }
  cwd: string;
  processes = new Array<ChildProcess>();
  tempDirs = new Array<string>();
  shuttingDown = false;

  setDefaultWorkDir(workDir: string) {
    console.log(`   `,
      clr.gray(clr.bold('cd')),
      clr.gray(this.formatArgs([workDir])));
    this.cwd = workDir;
  }
  static registerKnownDir(prefix: string, variable: string) {
    console.log(`   `,
      clr.blue(variable.slice(1))
      +clr.gray('='+prefix));
    KnownDirs.push([prefix, variable]);
  }
  addTempDir(tempDir: string) {
    this.tempDirs.push(tempDir);
  }
  formatArgs(args: string[]) {
    return args.map(arg => {
      const knownDir = KnownDirs
        .find(([prefix]) => arg.startsWith(prefix));
      if (knownDir) {
        arg = clr.blue(knownDir[1])+arg.slice(knownDir[0].length);
      } else if (arg.startsWith(this.cwd)) {
        arg = clr.blue('$PWD')+arg.slice(this.cwd.length);
      }
      if (arg.includes(' ')) {
        return `"${arg}"`;
      }
      return arg;
    }).join(' ');
  }

  onInterrupt = async () => {
    if (this.shuttingDown) return;
    console.log();
    console.log('--> Interrupted, cleaning up...');
    await this.shutdown();
    console.log('    Caio!');
    console.log();
  }

  // Purpose-specific entrypoints

  async createTempDir({andSwitch=false} = {}) {
    let cmdStr = `${clr.bold('mktemp')} -d`;
    if (andSwitch) {
      cmdStr = `${clr.bold('cd')} "$(${cmdStr})"`;
    }
    cmdStr = clr.gray(cmdStr);
    await Deno.stdout.write(new TextEncoder().encode('    '+cmdStr));

    try {
      const proc = Deno.run({cmd: [`mktemp`, `-d`], stdout: 'piped'});
      const stdout = new TextDecoder('utf-8').decode(await proc.output()).trim();
      this.tempDirs.push(stdout);
      await Deno.stdout.write(new TextEncoder().encode(clr.blue(` # ${stdout}`)));

      if (andSwitch) {
        this.cwd = stdout;
      }
      return stdout;
    } finally {
      await Deno.stdout.write(new TextEncoder().encode(`\n`));
    }
  }

  // Generic execution

  async execUtility(cmd: string, args: string[], opts: {cwd?: string} = {}): Promise<{stdout: string, stderr: string, status: Deno.ProcessStatus}> {
    if (opts.cwd && opts.cwd !== this.cwd) {
      console.log(`   `,
        clr.gray(clr.bold('cd')),
        clr.gray(this.formatArgs([opts.cwd])));
    }
    await Deno.stdout.write(new TextEncoder().encode(
      `    ${clr.gray(clr.bold(cmd))} ${clr.gray(this.formatArgs(args))}`));
    try {
      const proc = Deno.run({
        cmd: [cmd, ...args],
        cwd: opts.cwd ?? this.cwd,
        stdout: 'piped',
        stderr: 'piped',
      });
      const [stdoutRaw, stderrRaw, status] = await Promise.all([proc.output(), proc.stderrOutput(), proc.status()]);
      const stdout = new TextDecoder().decode(stdoutRaw);
      const stderr = new TextDecoder().decode(stderrRaw);
      if (!status.success) {
        throw new Error(`Command '${cmd}' exited with status ${JSON.stringify(status)}.\n-----\n`+stderr+`\n-----\n`+stdout);
      }
      return {stdout, stderr, status};
    } finally {
      await Deno.stdout.write(new TextEncoder().encode(`\n`));
    }
  }

  launchBackgroundProcess(cmd: string, opts: {
    args?: string[];
    cwd?: string;
    env?: Record<string,string>;
  }): ChildProcess {
    if (opts.cwd && opts.cwd !== this.cwd) {
      console.log(`   `,
        clr.gray(clr.bold('cd')),
        clr.gray(this.formatArgs([opts.cwd])));
    }
    console.log(`   `,
      clr.gray(clr.bold(cmd)),
      clr.gray(this.formatArgs(opts.args ?? [])),
      clr.gray(clr.bold('&')));

    // actually launch the process
    const proc = new ChildProcess(Deno.run({
      cmd: [cmd, ...(opts.args ?? [])],
      cwd: opts.cwd ?? this.cwd,
      env: opts.env,
      stdin: 'null',
      stdout: 'piped',
      stderr: 'piped',
    }));

    this.addBackgroundProcess(proc);
    return proc;
  }

  // add a process to the background list
  // these will be monitored and also stopped when we want to exit
  addBackgroundProcess(process: ChildProcess) {
    this.processes.push(process);
    process.status.then(status => {
      if (this.shuttingDown) return;
      console.log('Process', process.proc.pid, 'ended:', status.code);
    });
  }

  async shutdown() {
    this.shuttingDown = true;
    // signals.forEach(x => x.dispose()); // prevent future interupts
    const processPromises = this.processes
      .map(p => p.status.catch(() => {}));

    for (const process of this.processes) {
      console.log('   ',
        clr.gray(clr.bold('kill')),
        clr.gray(process.proc.pid.toString(10)),
        clr.blue(`# ${this.formatArgs(['TODO', 'process.spawnargs'])}`));
      process.cancel();
    }
    await Promise.all(processPromises);

    for (const dir of this.tempDirs) {
      await this.execUtility('rm', ['-rf', dir]);
    }
  }

}

import {
  ReadLineTransformer,
} from 'https://deno.land/x/kubernetes_client@v0.2.4/lib/stream-transformers.ts';

class ChildProcess {
  proc: Deno.Process<Deno.RunOptions & {stdout: 'piped', stderr: 'piped'}>;
  status: Promise<Deno.ProcessStatus>;
  constructor(proc: Deno.Process<Deno.RunOptions & {stdout: 'piped', stderr: 'piped'}>) {
    this.proc = proc;
    this.status = proc.status();
    this.status.then(x => {
      console.log('   ', 'child', proc.pid, 'exited with', x.code);
    })
  }
  cancel() {
    this.proc.kill(15); // SIGTERM
  }
  perLine() {
    const combined = readerFromIterable(combine([
      iter(this.proc.stderr, {bufSize: 1024}),
      iter(this.proc.stdout, {bufSize: 1024}),
    ]));
    return readableStreamFromReader({
      read: combined.read.bind(combined),
      close: this.cancel.bind(this),
    }).pipeThrough(new ReadLineTransformer('utf-8'));
  }
  async stdout() {
    return new TextDecoder('utf-8').decode(await this.proc.output());
  }
}
