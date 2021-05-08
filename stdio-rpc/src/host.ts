import { BufReader } from "https://deno.land/std@0.95.0/io/bufio.ts";
import { writeAll } from "https://deno.land/std@0.95.0/io/util.ts";
import { TextProtoReader } from "https://deno.land/std@0.95.0/textproto/mod.ts";

import { SkylinkClientBase, SkylinkClient, InlineChannelClient, ErrorEntry, Entry, SkylinkClientDevice } from "../../skylink/src/mod.ts";
import { SkyResponse, WireResponse, WireRequest } from "../../skylink/src/types.ts";

import { enforceMark } from "./common.ts";

export async function SpawnRpcTenant(scriptPath: string | URL) {
  const proc = Deno.run({
    cmd: ['deno', 'run', '--', scriptPath.toString()],
    stdin: 'piped',
    stdout: 'piped',
  });
  const statusPromise = proc.status();

  const sock = new RpcTenantClient(proc.stdout, proc.stdin);
  const device = new SkylinkClientDevice(sock, '');

  statusPromise.then(stat => {
    sock.stop(new ErrorEntry('reason',
    stat.success ? 'tenant-exited' : 'tenant-failed', 'deno-rpc/host',
    `RPC tenant process exited with status ${stat.code}`));
    device.markClosed();
  });

  await device.ready; // wait for the device's ping to come back
  // this ensures the process is skylink-aware at all

  return {
    process: proc,
    exitStatus: statusPromise,
    skylink: sock,
    device: device,
  };
}

export class RpcTenantClient extends SkylinkClientBase implements SkylinkClient {
  constructor(
    private input: Deno.Reader,
    private output: Deno.Writer & Deno.Closer,
  ) {
    super();
    this.attach(new InlineChannelClient());

    enforceMark(input, output);
    this.runLoop();
  }
  waitingReceivers = new Array<{
    resolve: (frame: SkyResponse) => void, reject: (err: Error) => void;
  }>();
  isLive = true;

  async runLoop() {
    // TODO: prevent running multiple times
    const input = new TextProtoReader(new BufReader(this.input));

    while (true) {
      const line = await input.readLine();
      if (line === null) {
        break;
      } else if (!line.startsWith(' -- {')) {
        if (line) console.error(` tenant stdout: ${line}`);
        continue;
      }

      let frame: WireResponse;
      try {
        frame = JSON.parse(line.slice(4));
      } catch (err) {
        this.stop(new ErrorEntry('reason',
          'inbound-json-parse', 'deno-rpc/host',
          `Couldn't parse JSON from tenant's frame`));
        return;
      }

      // console.log('host <-- tenant', frame);
      this.receiveFrame(frame);
    }

    // console.error('host runLoop exited')
    this.stop(new ErrorEntry('reason',
      'conn-closed', 'deno-rpc/host',
      'Standard output was closed'));
  }

  stop(input?: Entry) {
    if (!this.isLive) return;
    this.output.close();
    this.isLive = false;

    let message = `${input?.Type ?? 'Unknown'} reason`;
    if (input?.Type === 'Error') {
      message = input.inspect();
    }

    const error = new Error(`Interrupted: Skylink WS transport was stopped: ${message}`);
    this.waitingReceivers.forEach(x => {
      x.reject(error);
    });
    this.waitingReceivers.length = 0;

    this.handleShutdown(input);
  }

  async postMessage(message: WireRequest) {
    // if (!this.ws) throw new Error(`No active websocket to post message to`);
    // console.log('client --> server', message);
    const encoder = new TextEncoder();
    await writeAll(this.output, encoder.encode(` -- ${JSON.stringify(message)}\n`));
    const {_after} = message as {_after?: () => void};
    _after?.();
  }

  volley(request: WireRequest) {
    return new Promise<SkyResponse>((resolve, reject) => {
      this.waitingReceivers.push({resolve, reject});
      this.postMessage(request);
    });
  }

  // triggered for packets from the server
  processFrame(frame: SkyResponse) {
    const receiver = this.waitingReceivers.shift();
    if (receiver) {
      return receiver.resolve(frame);
    } else {
      throw new Error(`skylink received skylink payload without receiver`);
    }
  }
}
