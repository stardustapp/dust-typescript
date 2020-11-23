import {SkylinkClient, SkylinkClientBase} from './client.ts';
import {InlineChannelClient} from './extensions/channel-client.ts';
import { SkyRequest, SkyResponse, WireRequest, WireResponse } from "./types.ts";

export class WebsocketSkylinkClient extends SkylinkClientBase implements SkylinkClient {
  constructor(
    public endpoint: string,
    private wsConstructor = WebSocket,
  ) {
    super();
    this.ready = this.init();
    this.attach(new InlineChannelClient());
  }
  waitingReceivers = new Array<{resolve: (frame: SkyResponse) => void, reject: (err: Error) => void}>();
  isLive = true;
  ready: Promise<void>;
  pingTimer?: number;
  ws: WebSocket | null = null;

  async init() {
    console.log(`Starting Skylink Websocket to ${this.endpoint}`);
    this.pingTimer = setInterval(() => this.volley({Op: 'ping'}), 30 * 1000);

    // this.ws = new WebSocket(this.endpoint, ['skylink', 'skylink-inline-channels', 'skylink-reversal']);
    this.ws = new WebSocket(`${this.endpoint}?extensions=inline-channels,reversal`);
    this.ws.onmessage = msg => {
      const frame: WireResponse = JSON.parse(msg.data);
      // console.log('client <-- server', frame);
      this.receiveFrame(frame);
    };

    // wait for connection or failure
    try {
      await new Promise((resolve, reject) => {
        if (!this.ws) return reject(new Error(`BUG: ws was gone immediately`));
        this.ws.onopen = resolve;
        this.ws.onclose = () => {
          reject('Skylink websocket has closed.'); // TODO: handle shutdown
          this.stop();
        };
        this.ws.onerror = err => {
          this.ws = null;
          reject(new Error(`Skylink websocket has failed. ${err}`));
        };
      });

    } catch (err) {
      // clean up after any error that comes before any open
      this.isLive = false;
      this.ws = null;

      throw err;
    }
  }

  stop(input=null) {
    if (this.ws) {
      console.log('Shutting down Websocket transport')
      clearInterval(this.pingTimer);
      this.ws.close();
    }

    const error = new Error(`Interrupted: Skylink WS transport was stopped`);
    this.waitingReceivers.forEach(x => {
      x.reject(error);
    });
    this.waitingReceivers.length = 0;

    this.handleShutdown(input);
  }

  postMessage(message: WireRequest) {
    if (!this.ws) throw new Error(`No active websocket to post message to`);
    // console.log('client --> server', message);
    this.ws.send(JSON.stringify(message));
    if (message._after) message._after();
  }

  volley(request: WireRequest) {
    return this.ready
      .then(() => new Promise<SkyResponse>((resolve, reject) => {
        this.waitingReceivers.push({resolve, reject});
        this.postMessage(request);
      }));
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

  /*
  return {
    channel: chan.map(entryToJS),
    stop: () => {
      console.log('skylink Requesting stop of chan', obj.Chan);
      return this.volley({
        Op: 'stop',
        Path: '/chan/'+obj.Chan,
      });
    },
  };*/
}
