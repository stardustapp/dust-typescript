import { SkyResponse } from "../types.ts";
import { Entry } from "./entries/index.ts";

export type ChannelCallback<Tnext> = (x: ChannelPacket<Tnext>) => void | Promise<void>;
export interface ChannelCallbacks<Tnext> {
  onNext: (x: ChannelPacket<Tnext> & {Status: 'Next'}) => void | Promise<void>;
  onError: (x: ChannelPacket<Tnext> & {Status: 'Error'}) => void | Promise<void>;
  onDone: (x: ChannelPacket<Tnext> & {Status: 'Done'}) => void | Promise<void>;
  // [key: string]: ChannelCallback<Tnext | Entry> | undefined;
}

type ChannelPacket<Tnext> = {
  Output: Tnext;
  Status: 'Next';
} | {
  Output?: Entry;
  Status: 'Error' | 'Done';
};

export interface ChannelEntry {
  Name?: string;
  Type: 'Channel';
  channel: Channel;
  stop: () => void;
}

// compare to Rx Observable
export class Channel<Tnext=Entry> {
  constructor(
    public id: string,
  ) {
    this.burnBacklog = this.burnBacklog.bind(this);
  }
  queue: Array<ChannelPacket<Tnext>|'waiting'> = ['waiting'];
  callbacks?: ChannelCallbacks<Tnext>;
  alive = true;
  Type = "Channel" as const;

  // add a packet to process after all other existing packets process
  handle(packet: ChannelPacket<Tnext>) {
    if (!this.alive) throw new Error(
      `Channel isn't alive`);
    if (!packet.Status) throw new Error(
      `Channel ${this.id} got frame without a Status`);

    this.queue.push(packet);
    if (this.queue.length == 1 && this.callbacks) {
      // if we're alone at the front, let's kick it off
      this.burnBacklog();
    }

    if (packet.Status !== 'Next') {
      this.alive = false;
    }
  }

  start(callbacks: ChannelCallbacks<Tnext>) {
    this.callbacks = callbacks;
    var item;
    //console.log('Starting channel #', this.id);
    return this.burnBacklog();
    // while (item = this.queue.shift()) {
    //   this.route(item);
    // }
  }

  burnBacklog(): Promise<void> | undefined {
    const item = this.queue.shift();
    if (item === 'waiting') {
      // skip dummy value
      return this.burnBacklog();
    } else if (item) {
      return this.route(item).then(this.burnBacklog);
    }
  }

  route(packet: ChannelPacket<Tnext>) {
    if (!packet.Status) throw new Error(
      `Channel ${this.id} got frame without a Status`);
    const callback = this.callbacks ? (this.callbacks as unknown as Record<string,ChannelCallback<Tnext>>)['on' + packet.Status] : undefined;
    if (callback) {
      return callback(packet) || Promise.resolve();
    } else {
      console.log("Channel #", this.id, "didn't handle", packet);
      return Promise.resolve();
    }
  }

  /////////////////
  // Public API

  // Like forEach but you are given every packet unwrapped, and simply told when there are no more coming.
  forEachPacket(effect: (x: ChannelPacket<Tnext>) => void, finisher: (x?: Entry) => void) {
    if (!finisher) {
      finisher = (pkt) => {
        console.log('Channel #', this.id, 'came to an end. No one cared.');
      };
    }

    this.start({
      onNext: effect,
      onError(x) {
        effect(x);
        finisher(x.Output);
      },
      onDone(x) {
        effect(x);
        finisher(x.Output);
      },
    })
  }

  // You give a main callback, and two different finishers
  forEach(effect: (x: Tnext) => void, errorFinisher: (x?: Entry) => void, doneFinisher: (x?: Entry) => void) {
    if (!errorFinisher) {
      errorFinisher = (pkt) => {
        console.warn('Channel #', this.id, "encountered an Error,",
                     "but no finalizer was added to handle it.", pkt);
      };
    }
    if (!doneFinisher) {
      doneFinisher = (pkt) => {
        console.log('Channel #', this.id, 'came to an end. No one cared.');
      };
    }

    this.start({
      onNext(x) {
        if (x.Output) effect(x.Output);
      },
      onError(x) {
        errorFinisher(x.Output);
      },
      onDone(x) {
        doneFinisher(x.Output);
      },
    });
    return new Channel('void');
  }

  map<Tout>(transformer: (x: Tnext) => Tout) {
    const chan = new Channel<Tout>(this.id + '-map');
    this.start({
      onNext(x) {
        if (!x.Output) return;
        chan.handle({ ...x,
          Output: transformer(x.Output), // TODO: rename Value (?)
        });
      },
      onError(x) { chan.handle(x); },
      onDone(x) { chan.handle(x); },
    });
    return chan;
  }

  filter(selector: (x: Tnext) => boolean) {
    const chan = new Channel<Tnext>(this.id + '-filter');
    this.start({
      onNext(x) {
        if (x.Output && selector(x.Output)) {
          chan.handle(x);
        }
      },
      onError(x) { chan.handle(x); },
      onDone(x) { chan.handle(x); },
    });
    return chan;
  }
}
