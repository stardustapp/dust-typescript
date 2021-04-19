import {
  Channel,
  FolderEntry, StringEntry,
  InflateSkylinkLiteral,
  LiteralDevice,
  Entry,
} from '../skylink/src/mod.ts';
import { SkyDevice, SkyEntry } from "../skylink/src/types.ts";

export class Pollable implements SkyDevice<SkyEntry> {
  constructor() {}
  currentEntry: Entry | null = null;
  isReady = false;
  isUpdated = false;
  interestedParties = new Set<(ctx: Pollable) => void>();

  markUpdated() {
    if (this.isReady && !this.isUpdated) {
      this.isUpdated = true;

      const parties = this.interestedParties;
      if (parties.size < 1) return;

      this.interestedParties = new Set;
      for (const interestedParty of parties) {
        interestedParty(this);
      }
    }
  }

  reset() {
    this.isUpdated = false;
  }

  async getEntry(path: string): Promise<SkyEntry | null> {
    // TODO: add /stop
    if (path !== '/latest') throw new Error(
      `TODO: only /latest is available on these`);

    // TODO: is this racey?
    if (!this.isReady) {
      await new Promise(resolve => {
        this.interestedParties.add(resolve);
      });
    }

    return {
      get: async () => {
        if (this.isUpdated) {
          this.reset();
        }
        return this.currentEntry;
      },
    } as SkyEntry;
  }

}

export class PollableSubscribeOne extends Pollable {
  constructor() {
    super();
  }
  channel?: Channel<Entry>;

  stop() {
    this.requestStop?.();
  }
  private requestStop: (() => void) | undefined;

  async subscribeTo(entry: SkyEntry) {
    if (this.requestStop) throw new Error(
      `BUG: subscribe was called a second time`);
    const stopRequestedP = new Promise<void>(resolve => this.requestStop = resolve);

    if (!entry.subscribe) throw new Error(`Tried subscribing SubOne to non-subscribable`);
    await entry.subscribe(0, {
      invoke: async (cb) => {
        const channel = new Channel<Entry>('pollable '+((entry as {path?: string}).path||'one'));
        this.channel = channel;
        cb({
          next(Output: Entry) {
            channel.handle({Status: 'Next', Output});
          },
          error(Output: Entry) {
            channel.handle({Status: 'Error', Output});
          },
          done() {
            channel.handle({Status: 'Done'});
          },
          onStop(cb) {
            stopRequestedP.then(() => cb());
          },
        });
        return channel;
      },
    });

    if (!this.channel) throw new Error(
      `BUG: No channel was created in time`);

    this.channel.forEach(notif => {
      if (notif.Type !== 'Folder') return;
      const path = notif.getChild('path', false, 'String');
      if (path && path.StringValue !== '') throw new Error(
        `BUG: PollableSubscribeOne received sub event for non-root "${path.StringValue}"`);

      const notifType = notif.getChild('type', true, 'String').StringValue;
      switch (notifType) {

        case 'Added':
          if (this.currentEntry) throw new Error(
            `BUG: Received 'Added' but already had an entry`);
          this.currentEntry = notif.getChild('entry') ?? null;
          break;

        case 'Changed':
          if (!this.currentEntry) throw new Error(
            `BUG: Received 'Changed' but didn't have an entry yet`);
          this.currentEntry = notif.getChild('entry') ?? null;
          break;

        case 'Removed':
          if (!this.currentEntry) throw new Error(
            `BUG: Received 'Removed' but didn't have an entry yet`);
          this.currentEntry = null;
          break;

        case 'Ready':
          if (this.isReady) throw new Error(
            `BUG: Received 'Ready' but already was ready`);
          this.isReady = true;
          break;

        default: throw new Error(
          `TODO: subscription received ${notifType}`);
      }
      this.markUpdated();
    });

    // TODO: handle the channel closing somehow
  }
}

export class PollableTreeSubscription extends Pollable {
  rootEntry: any;
  entryDevice: LiteralDevice;
  channel: Channel<Entry> | undefined;
  constructor() {
    super();
    this.rootEntry = new FolderEntry('root');
    this.entryDevice = new LiteralDevice(this.rootEntry);
  }

  stop() {
    this.requestStop?.();
  }
  private requestStop: (() => void) | undefined;

  async getEntry(path: string) {
    // TODO: is this racey?
    if (!this.isReady) {
      await new Promise(resolve => {
        this.interestedParties.add(resolve);
      });
    }

    // TODO: add /stop
    if (path === '/latest' || path.startsWith('/latest/')) {
      if (this.isUpdated) {
        this.reset();
      }
      return this.entryDevice.getEntry(path);

    } else throw new Error(
      `TODO: only /latest is available on these`);
  }

  async subscribeTo(entry: SkyEntry, depth: number) {
    if (this.requestStop) throw new Error(
      `BUG: subscribe was called a second time`);
    const stopRequestedP = new Promise<void>(resolve => this.requestStop = resolve);

    if (!entry.subscribe) throw new Error(`Tried subscribing TreeSub to non-subscribable`);
    await entry.subscribe(depth, {
      invoke: async (cb) => {
        const channel = new Channel<Entry>('pollable '+((entry as {path?: string})||'one'));
        this.channel = channel;
        cb({
          next(Output) {
            // console.log('subscribe packet', Output);
            if (Output) channel.handle({Status: 'Next', Output});
          },
          error(Output) {
            channel.handle({Status: 'Error', Output});
          },
          done() {
            channel.handle({Status: 'Done'});
          },
          onStop(cb) {
            stopRequestedP.then(() => cb());
          },
        });
        return channel;
      },
    });

    if (!this.channel) throw new Error(
      `BUG: No channel was created in time`);

    this.channel.forEach(notif => {
      if (notif.Type !== 'Folder') return;
      const notifType = notif.getChild('type', true, 'String').StringValue;

      if (notifType === 'Ready') {
        if (this.isReady) throw new Error(
          `BUG: Received 'Ready' but already was ready`);
        this.isReady = true;
        this.markUpdated();
        return;
      }

      const path = notif.getChild('path', true, 'String').StringValue;
      const notifEntry = notif.getChild('entry');
      if (notifEntry?.Type == null || notifEntry?.Type === 'Device') throw new Error();

      const pathStack = ('latest/'+path)
        .replace(/\/$/, '')
        .split('/')
        .map(decodeURIComponent);
      const finalName = pathStack.pop()!;

      let parent = this.rootEntry;
      for (const part of pathStack) {
        parent = parent.getChild(part, true, 'Folder');
      }
      const existing = parent.getChild(finalName);
      const myIdx = parent.Children.indexOf(existing);

      switch (notifType) {

        case 'Added':
          if (existing) throw new Error(
            `BUG: Received 'Added' for '${path}' but already had an entry`);
          if (!notifEntry) throw new Error(
            `BUG: Received 'Added' for '${path}' but didn't receive any contents`);

          parent.append((notifEntry.Type === 'Folder')
            ? new FolderEntry(finalName)
            : InflateSkylinkLiteral({...notifEntry, Name: finalName}));
          break;

        case 'Changed':
          if (!existing) throw new Error(
            `BUG: Received 'Changed' for '${path}' but didn't have an entry yet`);
          if (!notifEntry) throw new Error(
            `BUG: Received 'Changed' for '${path}' but didn't receive any contents`);

          if (notifEntry.Type === 'Folder') {
            // TODO: folder changes
          } else {
            parent.Children.splice(myIdx, 1, InflateSkylinkLiteral({...notifEntry, Name: finalName}));
          }
          break;

        case 'Removed':
          if (!existing) throw new Error(
            `BUG: Received 'Removed' for '${path}' but didn't have an entry yet`);

          parent.Children.splice(myIdx, 1);
          break;

        default: throw new Error(
          `TODO: subscription received ${notifType}`);
      }

      this.markUpdated();
    });

    // TODO: handle the channel closing somehow
  }
}

export class PollableInterval extends Pollable {
  timeout: number | null = null;
  constructor(
    public milliseconds: number,
  ) {
    super();
    this.isReady = true;
    this.currentEntry = new StringEntry('timer', new Date().toISOString());
    this.markUpdated();
  }

  reset() {
    super.reset();

    if (this.timeout) {
      console.log('BUG: PollableInterval reset before it was timed out');
      clearTimeout(this.timeout);
    }

    this.timeout = setTimeout(() => {
      this.currentEntry = new StringEntry('timer', new Date().toISOString());
      this.markUpdated();
      this.timeout = null;
    }, this.milliseconds);
  }

  stop() {
    if (this.timeout != null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}

export async function PerformPoll(devicesEntry: FolderEntry, timeoutMs: number) {
  const readyList = new FolderEntry('Ready');
  const devices = new Map<Pollable, string>();
  for (const devEntry of devicesEntry.Children) {
    if (devEntry.Type !== 'Device') throw new Error(
      `PerformPoll needs a "Device", was given a "${devEntry.Type}" as "${devEntry.Name}"`);

    const dev = devEntry._device as Pollable;
    if (dev.isUpdated) {
      readyList.append(new StringEntry(devEntry.Name, 'yes'));
    }
    devices.set(dev, devEntry.Name);
  }

  if (readyList.Children.length > 0) {
    return readyList;
  }

  // ok we need to wait
  let timeout;
  let myResolve: ((value: Pollable | "timeout" | PromiseLike<Pollable | "timeout">) => void);
  const readyDev = await new Promise<Pollable | 'timeout'>(resolve => {
    timeout = setTimeout(() => resolve('timeout'), timeoutMs);
    myResolve = resolve;

    for (const devEntry of devices.keys()) {
      devEntry.interestedParties.add(resolve);
    }
  });

  // unregister
  for (const devEntry of devices.keys()) {
    devEntry.interestedParties.delete(myResolve!);
  }
  clearTimeout(timeout);

  if (readyDev !== 'timeout') {
    const devName = devices.get(readyDev)!;
    readyList.append(new StringEntry(devName, 'yes'));
  }

  return readyList;
}
