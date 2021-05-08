import { BufReader } from "https://deno.land/std@0.95.0/io/bufio.ts";
import { writeAll } from "https://deno.land/std@0.95.0/io/util.ts";
import { TextProtoReader } from "https://deno.land/std@0.95.0/textproto/mod.ts";

import { ChannelExtension, InlineChannelCarrier, Environment, SkylinkServer, ReversedSkylinkClient, InlineChannelClient, ErrorEntry } from '../../skylink/src/mod.ts';
import { WireRequest } from "../../skylink/src/types.ts";

import { enforceMark } from "./common.ts";

export class RpcTenant {
  constructor(
    public env: Environment,
    private input: Deno.Reader = Deno.stdin,
    private output: Deno.Writer & Deno.Closer = Deno.stdout,
  ) {
    // Really try to prevent reuse, because it's always a bug
    enforceMark(input, output);

    const encoder = new TextEncoder();
    this.skylink = new SkylinkServer(this.env, async body => {
      await writeAll(this.output, encoder.encode(` -- ${JSON.stringify(body)}\n`));
      // console.error(`tenant output:`, ` -- ${JSON.stringify(body)}`)
      const {_after} = body as {_after?: () => void};
      _after?.();
    });
    this.skylink.attach(new ChannelExtension());
    this.skylink.attach(new InlineChannelCarrier());
    this.skylink.attach(new ReversedSkylinkClient([
      new InlineChannelClient(),
    ]));

    this.skylink.shutdownHandlers.push(reason => {
      this.output.close();

      let message = `${reason?.Type ?? 'Unknown'} reason`;
      if (reason?.Type === 'Error') {
        message = reason.inspect();
      }
      console.log('closing stdout, because:', message);
    });

    // setInterval(() => {
    //   if (this.skylink.isActive) {
    //     console.log('WARN: WS server is "active" with', this.skylink.reqQueue.length, 'things in queue');
    //   }
    // }, 5000);
  }
  skylink: SkylinkServer;
  loopRunning = false;

  async runLoop() {
    // TODO: prevent running multiple times
    const input = new TextProtoReader(new BufReader(this.input));

    while (true) {
      const line = await input.readLine();
      // console.error('tenant input:', line);
      if (line === null) {
        break;
      } else if (!line.startsWith(' -- {')) {
        if (line) console.error(` tenant stdin given non-json line: ${JSON.stringify(line)}`);
        continue;
      }

      let request: WireRequest;
      try {
        request = JSON.parse(line.slice(4));
      } catch (err) {
        this.skylink.handleShutdown(new ErrorEntry('reason',
          'inbound-json-parse', 'deno-rpc/tenant',
          `Couldn't parse JSON from your frame`));
        return;
      }

      // receiveFrame handles queuing and sending the response
      await this.skylink
        .receiveFrame(request)
        .catch(err => {
          console.error('WS ERR:', err);
          this.skylink.handleShutdown(new ErrorEntry('reason',
            'unhandled-err', 'deno-rpc/tenant',
            `An unhandled server ${err.constructor.name} occurred processing your request`));
        });
    }

    this.skylink.handleShutdown(new ErrorEntry('reason',
      'conn-closed', 'deno-rpc/tenant',
      'Standard input was closed'));
    // TODO: shut down session

    console.log('tenant runLoop() loop completed');
  }
}
