import {Environment} from '../api/environment.ts';
import { SkylinkClient, SkylinkClientBase } from "../client.ts";
import {SkylinkServer} from '../server.ts';
import { SkylinkExtension, WireRequest, WireResponse } from "../types.ts";

// Lets a SkylinkClient process server-sent operations inband via a SkylinkServer
// Effectively gives you get full-duplex request/response
// Setting up bidirectional inband channels via reversal works normally :)
// Implemented by checking for 'Op' presence on each frame and redirecting those frames to a virtual 'server' for handling

export class SkylinkReversalExtension implements SkylinkExtension<SkylinkClient> {
  constructor(
    public extensions: Array<SkylinkExtension<SkylinkServer>>
  ) {
    // offer nothing within the pub folder by default
    // this hack hides the endpoint list from enumeration
    this.serverEnv.bind('/pub', {
      getEntry(path) { return null; },
    });
  }
  serverEnv = new Environment;
  nextPub = 0;
  // boundDevices = new Map;

  clientServer?: SkylinkServer;

  attachTo(skylink: SkylinkClient) {
    if (!skylink.postMessage) throw new Error(
      `Only clients with direct postMessage access can use reversal`);

    // create a virtual server that we want to expose
    this.clientServer = new SkylinkServer(this.serverEnv, skylink
      .postMessage.bind(skylink));

    for (const extension of this.extensions) {
      this.clientServer.attach(extension);
    }

    // intercept server-sent frames with Op as request frames for our server
    skylink.frameProcessors.push(this.processFrame.bind(this));

    // Bind each Device that is passed out to a new prefix
    // TODO: probably not for things we initially got elsewhere
    skylink.extraDeflaters.set('Device', entry => {
      if (entry.Type !== 'Device') throw new Error(`BUG: Device wasnt a Device`);

      const prefix = `/pub/${this.nextPub}`;
      this.nextPub++;

      this.serverEnv.bind(prefix, entry);
      return {Type: 'Device', Name: entry.Name, ReversalPrefix: prefix};
    });
  }

  processFrame(frame: WireResponse) {
    if (!('Op' in frame)) return false;

    // unawaited async..
    this.clientServer
      ?.receiveFrame(frame);
    return true;
  }
}
