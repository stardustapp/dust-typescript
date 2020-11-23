import {Channel} from '../api/channel.ts';
import { DeflateToSkylinkLiteral, Entry } from "../api/entries/index.ts";
import {StringEntry} from '../api/entries/StringEntry.ts';
import {FunctionDevice} from '../devices/function-device.ts';
import { SkylinkServer } from "../server.ts";
import { ServerChannel, SkylinkExtension, SkyRequest, WireRequest, WireResponse } from "../types.ts";

let allOpenChannels = 0;
// const metricsClock = setInterval(() => {
//   Datadog.Instance.gauge('skylink.server.open_channels', allOpenChannels, {});
// }, 10*1000);
// if (metricsClock.unref) {
//   metricsClock.unref();
// }

const allChannels = new WeakMap<Channel,number>();

// for the server
export class ChannelExtension implements SkylinkExtension<SkylinkServer> {
  constructor() {}
  channels = new Map<number,Channel>();
  channelStops = new Map<number,(reason: Entry) => void>();
  nextChan = 1;

  attachTo(skylink: SkylinkServer) {
    skylink.shutdownHandlers.push(this.handleShutdown.bind(this));
    skylink.ops.set('stop', this.stopOpImpl.bind(this));
    skylink.env.bind('/channels/new', new FunctionDevice(this.newChannelFunc.bind(this)));
  }

  handleShutdown() {
    for (const triggerStop of this.channelStops.values()) {
      triggerStop(new StringEntry('reason', 'Skylink is shutting down'));
    }
    this.channels.clear();
  }

  newChannelFunc(input: Entry | null | ((cbs: ServerChannel) => void)): Promise<Entry> {
    if (typeof input !== 'function') throw new Error(`BUG: newChannelFunc needs a Function`);
    //Datadog.Instance.count('skylink.channel.opens', 1, {});
    allOpenChannels++;

    const chanId = this.nextChan++;
    const channel = new Channel(`wire-${chanId}`);
    this.channels.set(chanId, channel);
    allChannels.set(channel, chanId);

    // Wire a way to async-signal the origin *once*
    const stopPromise = new Promise(resolve => {
      this.channelStops.set(chanId, resolve);
    });

    // Pass a simplified API to the thing that wanted the channel
    input({
      next(Output) {
        if (!Output) return;
        channel.handle({Status: 'Next', Output});
        if (typeof Output.Type !== 'string') throw new Error(
          `Server channel ${chanId} got output without a Type`);
        //Datadog.Instance.count('skylink.channel.packets', 1, {status: 'next'});
      },
      error(Output) {
        channel.handle({Status: 'Error', Output});
        allOpenChannels--;
        //Datadog.Instance.count('skylink.channel.packets', 1, {status: 'error'});
      },
      done() {
        channel.handle({Status: 'Done'});
        allOpenChannels--;
        //Datadog.Instance.count('skylink.channel.packets', 1, {status: 'done'});
      },
      onStop(cb) {
        stopPromise.then(cb);
      },
    });
    return Promise.resolve(channel as unknown as Entry);
  }

  stopOpImpl(request: SkyRequest) {
    const {Path} = request;
    if (!Path) throw new Error(`Path is required`);

    const chanId = parseInt(Path.split('/')[2]);
    if (!this.channels.has(chanId)) {
      throw new Error(`Channel at ${Path} not found`);
    }

    const input = request.Input ?? new StringEntry('reason', 'Client called `stop`');
    const triggerStop = this.channelStops.get(chanId);
    if (triggerStop) triggerStop(input);
    return null;
  }
}

// Attaches a 'Chan' field to responses when they pertain to a channel.
// The client gets packets over the original connection and use 'Chan' to differentiate them.
// TODO: switch to a 'Channel' Type (e.g. support channels within folders)
export class InlineChannelCarrier implements SkylinkExtension<SkylinkServer> {
  constructor() {
    // if (sendCb) throw new Error(
    //   `TODO: InlineChannelCarrier no longer accepts a sendCb`);
  }

  attachTo(skylink: SkylinkServer) {
    if (!skylink.postMessage) throw new Error(
      `Only server clients with direct postMessage access can use inline channels`);

    skylink.outputEncoders.push(this.encodeOutput.bind(this));
    this.sendCb = skylink.postMessage.bind(skylink);
  }
  sendCb?: (msg: WireResponse) => void;

  // If you return falsey, you get skipped
  encodeOutput(output: Entry | Channel): WireResponse | null {
    if (output.Type !== 'Channel') return null;
    const chanId = allChannels.get(output);
    if (!chanId) throw new Error(`BUG: encoding output for unmapped Channel ${output.id}`);

    return {
      Ok: true,
      Status: 'Ok',
      Chan: chanId,
      _after: this.plumbChannel.bind(this, output),
    };
  }

  plumbChannel(channel: Channel) {
    const chanId = allChannels.get(channel);
    if (!chanId) throw new Error(`BUG: plumbing output for unmapped Channel ${channel.id}`);

    const {sendCb} = this;
    if (!sendCb) throw new Error(`BUG: can't plumb a channel without a sendCb`);

    channel.forEachPacket(pkt => {
      sendCb({
        ...pkt,
        Ok: true,
        Output: pkt.Output ? DeflateToSkylinkLiteral(pkt.Output) : undefined,
        Chan: chanId,
      });
    }, () => {/* already handled */});
  }
}
