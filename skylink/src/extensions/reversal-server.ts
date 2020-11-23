import {SkylinkClient, SkylinkClientBase} from '../client.ts';
import {InlineChannelClient} from './channel-client.ts';
import {DeviceEntry} from '../api/entries/DeviceEntry.ts';
import {SkylinkClientDevice} from '../devices/skylink-client-device.ts';
import { SkylinkExtension, SkyRequest, SkyResponse, WireRequest } from "../types.ts";
import { SkylinkServer } from "../server.ts";

export class ReversedSkylinkClient extends SkylinkClientBase implements SkylinkExtension<SkylinkServer> {
  constructor(extensions: Array<SkylinkExtension<SkylinkClient>> = []) {
    super();

    for (const extension of extensions) {
      this.attach(extension);
    }
  }
  server?: SkylinkServer;
  waitingReceivers = new Array<{resolve: (resp: SkyResponse) => void, reject: (err: unknown) => void}>();

  attachTo(skylink: SkylinkServer) {
    this.server = skylink;
    if (!this.server.postMessage) throw new Error(
      `Only clients with direct postMessage access can use reversal`)

    // triggered for packets received from the real client
    skylink.frameProcessors.push(frame => {
      // skip normal client->server frames
      if ('Op' in frame || 'op' in frame) return false;
      // intercept as if the frame was received from a server
      this.receiveFrame(frame);
      return true;
    });

    // when the real client sends a Device to our real server, mount it from our reversed client
    skylink.extraInflaters.set('Device', raw => {
      const rawDev = raw as {Type: 'Device', Name: string, ReversalPrefix: string};
      if (typeof rawDev.ReversalPrefix !== 'string') throw new Error(
        `TODO: only Devices with a ReversalPrefix can be sent over the wire`);
      return new DeviceEntry(rawDev.Name, new SkylinkClientDevice(this, rawDev.ReversalPrefix));
    });
  }

  volley(request: WireRequest) {
    return new Promise<SkyResponse>((resolve, reject) => {
      if (this.server?.postMessage) {
        this.waitingReceivers.push({resolve, reject});
        this.server?.postMessage(request);
      } else reject(new Error(`TODO: SkylinkServer doesn't support postMessage`));
    });
  }

  // triggered by real-client packets intended for us (via receiveFrame)
  processFrame(frame: SkyResponse): void {
    const receiver = this.waitingReceivers.shift();
    if (receiver) {
      return receiver.resolve(frame);
    } else {
      throw new Error(`skylink received skylink payload without receiver`);
    }
  }
}
