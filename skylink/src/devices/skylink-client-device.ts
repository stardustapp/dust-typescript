import { SkylinkClient } from "../client.ts";
import { StatelessHttpSkylinkClient } from '../client-http.ts';
import { WebsocketSkylinkClient } from '../client-websocket.ts';
import { EnumerationWriter, Invocable, ServerChannel, SkyDevice, SkyEntry, WireTypeUnknown } from "../types.ts";
import { DeflateToSkylinkLiteral, Entry } from "../api/entries/index.ts";
import { Channel, ChannelEntry } from "../api/channel.ts";

export class SkylinkClientDevice implements SkyDevice<SkylinkClientEntry> {
  ready: Promise<void>;
  closed: Promise<void>;
  markClosed!: () => void;
  constructor(
    public remote: SkylinkClient,
    public pathPrefix: string,
  ) {

    // copy promise from remote
    this.ready = Promise.resolve(remote.ready)
      .then(() => remote.performOp({Op: 'ping'}))
      .then(() => undefined);
    this.closed = new Promise(resolve => this.markClosed = resolve);
  }

  getEntry(path: string) {
    return new SkylinkClientEntry(this.remote, this.pathPrefix + path);
  }

  getSubRoot(path: string) {
    if (path === '') return this;
    return new SkylinkClientDevice(this.remote, this.pathPrefix + path);
  }

  static fromUri(uri: string) {
    if (!uri.startsWith('skylink+')) throw new Error(
      `BUG: SkylinkClientDevice given non-skylink URI of scheme "${uri.split('://')[0]}"`);

    const parts = uri.slice('skylink+'.length).split('/');
    const scheme = parts[0].slice(0, -1);
    const endpoint = parts.slice(0, 3).join('/') + '/~~export' + (scheme.startsWith('ws') ? '/ws' : '');
    const remotePrefix = ('/' + parts.slice(3).join('/')).replace(/\/+$/, '');

    if (scheme.startsWith('http')) {
      const skylink = new StatelessHttpSkylinkClient(endpoint);
      return new SkylinkClientDevice(skylink, remotePrefix);

    } else if (scheme.startsWith('ws')) {
      const skylink = new WebsocketSkylinkClient(endpoint);

      // TODO: works around irc-modem flaw with 'tags'
      // { Name: 'tags', Type: 'Unknown' }
      skylink.extraInflaters.set('Unknown', raw => ({Type: 'Unknown', Name: raw.Name} as unknown as Entry));

      const wsDevice = new SkylinkClientDevice(skylink, '/pub'+remotePrefix);
      skylink.shutdownHandlers.push(() => {
        skylink.ready = Promise.reject(new Error(`Skylink WS transport has been disconnected`));
        // TODO: either try reconnecting, or just shut the process down so it can restart
        wsDevice.markClosed();
      });
      return wsDevice;

    } else {
      throw new Error(`BUG: Tried importing a skylink of unknown scheme "${scheme}"`);
    }
  }
}

export class SkylinkClientEntry implements SkyEntry {
  constructor(
    public remote: SkylinkClient,
    public path: string,
  ) {}

  get() {
    return this.remote.performOp({
      Op: 'get',
      Path: this.path,
    }).then(x => x ?? null);
  }

  async enumerate(enumer: EnumerationWriter) {
    const response = await this.remote.performOp({
      Op: 'enumerate',
      Path: this.path||'/',
      Depth: enumer.remainingDepth(),
    });

    // transclude the remote enumeration
    if (response) enumer.visitEnumeration(response);
  }

  put(value: Entry | null) {
    return this.remote.performOp((value == null) ? {
      Op: 'unlink',
      Path: this.path,
    } : {
      Op: 'store',
      Dest: this.path,
      Input: DeflateToSkylinkLiteral(value),
    }).then(x => undefined);
  }

  invoke(input: Entry | null): Promise<Entry | null> {
    return this.remote.performOp({
      Op: 'invoke',
      Path: this.path,
      Input: input ? DeflateToSkylinkLiteral(input) : undefined,
    }).then(x => x ?? null);
  }

  async subscribe(depth: number, newChannel: Invocable<(c: ServerChannel) => void,Channel>) {
    console.log('starting remote sub to', this.path);
    const response = await this.remote.performOp({
      Op: 'subscribe',
      Path: this.path,
      Depth: depth,
    }) as (Entry | ChannelEntry);
    if (response.Type !== 'Channel') throw new Error(
      `BUG: subscribe() returned a ${response.Type} instead of Channel`);

    const {channel, stop} = response;
    return await newChannel.invoke(async c => {
      // proxy between remote and local channel
      channel.forEach(c.next, c.error, c.done);
      c.onStop(() => stop());
    });
  }
}
