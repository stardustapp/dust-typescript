import {Channel, ChannelEntry} from '../api/channel.ts';
import {Entry, InflateSkylinkLiteral} from '../api/entries/index.ts';
import { SkylinkClient } from "../client.ts";
import { SkylinkExtension, WireResponse, WireType } from "../types.ts";

// Detects a 'Chan' field on normal responses and reroutes them to Channel objects
export class InlineChannelClient implements SkylinkExtension<SkylinkClient> {
  constructor() {}
    // this.sendCb = sendCb;
  channels = new Map<number, Channel>();

  _client!: SkylinkClient;

  attachTo(skylink: SkylinkClient) {
    skylink.outputDecoders.push(this.decodeOutput.bind(this));
    skylink.frameProcessors.push(this.processFrame.bind(this));
    skylink.shutdownHandlers.push(this.handleShutdown.bind(this));

    // used to stop channels
    Object.defineProperty(this, '_client', {
      value: skylink,
    });
  }

  // Build Channel objects for output
  decodeOutput(frame: WireResponse): Entry | null {
    if (!frame.Chan || frame.Status !== 'Ok') return null;
    console.log('skylink client received new channel', frame.Chan);

    const chan = new Channel(`wire-${frame.Chan}`);
    this.channels.set(frame.Chan, chan);

    return {
      Type: 'Channel',
      channel: chan,
      stop: () => {
        // TODO?: drop new packets until the stop is ack'd ??
        return this._client.performOp({
          Op: 'stop',
          Path: '/chan/'+frame.Chan,
        });
      },
    } as ChannelEntry as unknown as Entry;
  }

  // Pass events to existing Channels
  processFrame(frame: WireResponse) {
    // Detect and route continuations
    if (!frame.Chan || (frame.Status !== 'Next' && frame.Status !== 'Done' && frame.Status !== 'Error')) return false;

    // find the target
    const chan = this.channels.get(frame.Chan);
    if (!chan) throw new Error(`Skylink received unroutable channel packet inline`);

    // pass the message
    const output = frame.Output ? InflateSkylinkLiteral(frame.Output) : undefined;
    if (frame.Status === 'Next') {
      if (output) chan.handle({Status: frame.Status, Output: output});
    } else {
      chan.handle({Status: frame.Status, Output: output});
    }

    if (frame.Status !== 'Next') {
      // clean up terminal channels
      this.channels.delete(frame.Chan);
    }
    return true;
  }

  // Shut down any lingering channels
  handleShutdown(input: Entry) {
    for (const chan of this.channels.values()) {
      // TODO: this could be richer
      chan.handle({Status: 'Error', Output: input});
    }
    this.channels.clear();
  }
}
