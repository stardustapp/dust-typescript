import {CoreOpsMap} from './core-ops.ts';
import {
  InflateSkylinkLiteral, DeflateToSkylinkLiteral, Entry,
} from './api/entries/index.ts';
import { Environment } from "./api/environment.ts";
import { SkylinkExtension, SkyRequest, WireRequest, WireResponse, WireType, WireTypeUnknown } from "./types.ts";

export class SkylinkServer {
  constructor(
    public env: Environment,
    public postMessage?: (msg: unknown) => void,
  ) {}
  ops = new Map(CoreOpsMap);

  // event handlers
  outputEncoders = new Array<(output: Entry) => WireResponse | null>();
  frameProcessors = new Array<(frame: WireRequest) => boolean>();
  shutdownHandlers = new Array<(input: Entry) => void>();
  extraInflaters = new Map<string,(input: WireTypeUnknown) => Entry>();
  extraDeflaters = new Map<string,(input: Entry) => WireTypeUnknown>();

  // support for lockstep requests
  isActive = false;
  reqQueue = new Array;

  attach(extension: SkylinkExtension<SkylinkServer>) {
    extension.attachTo(this);
  }

  encodeOutput(output: Entry | null): WireResponse {
    if (!output) return {Ok: true};

    // let extensions provide custom framing
    for (const encoder of this.outputEncoders) {
      const frame = encoder(output);
      if (frame) return frame;
    }

    // build a default frame
    return {
      Ok: true,
      Output: DeflateToSkylinkLiteral(output, this.extraDeflaters),
    };
  }

  handleShutdown(input: Entry) {
    for (const handler of this.shutdownHandlers) {
      handler(input);
    }
  }

  receiveFrame(frame: WireRequest) {
    // let extensions override the whole frame
    for (const processor of this.frameProcessors) {
      const result = processor(frame);
      if (result) return Promise.resolve(result);
    }

    // otherwise, put request in queue to process normally
    if (this.isActive) {
      return new Promise(resolve => this.reqQueue.push({
        frame, resolve,
      })).then(this.postMessage);
    } else {
      this.isActive = true;
      return this.processUsingQueue(frame)
        .then(this.postMessage);
    }
  }

  async processUsingQueue(frame: WireRequest) {
    try {
      // process now!
      return await this.processFrame(frame);
    } finally {
      // we're done with the req, move on
      if (this.reqQueue.length) {
        const nextInLine = this.reqQueue.shift();
        nextInLine.resolve(this.processUsingQueue(nextInLine.frame));
      } else if (this.isActive) {
        this.isActive = false;
      }
    }
  }

  // Called by transports when the client sends an operation
  // Promises a frame back
  processFrame(request: WireRequest) {
    const startTime = Date.now();

    const keys = Object.keys(request);
    if (keys.some(k => k[0] > '`')) { // HACK: checks for lowercase letters
      console.warn('WARN: Received Skylink frame with bad key casing, fixing it');
      const oldReq = request as unknown as Record<string,unknown>;
      const newReq: Record<string,unknown> = {};
      keys.forEach(key => {
        newReq[key[0].toUpperCase()+key.slice(1)] = oldReq[key];
      });
      request = newReq as unknown as WireRequest;
    }

    // inflate client-sent inputs first, supports 'reversal'
    const inflatedRequest: SkyRequest = { ...request,
      Input: request.Input ? InflateSkylinkLiteral(request.Input, this.extraInflaters) : undefined,
    };

    return this
      .performOperation(inflatedRequest)
      // wrap output into a response
      .then(this.encodeOutput.bind(this), err => {
        console.warn('!!! Operation failed with', err);
        return {
          Ok: false,
          Output: {
            Type: 'String',
            Name: 'error-message',
            StringValue: err.message,
          },
        };
      })
      // observe and pass response
      .then(response => {
        const endTime = Date.now();
        const elapsedMs = endTime - startTime;

        const {Op} = request;
        const {Ok} = response;
        //Datadog.Instance.count('skylink.op.invocation', 1, {Op, Ok});
        //Datadog.Instance.gauge('skylink.op.elapsed_ms', elapsedMs, {Op, Ok});

        return response;
      });
  }

  // Returns the 'Output' of an operation if Ok. Doesn't give a packet envelope!
  async performOperation(request: SkyRequest) {
    console.debug('--> inbound operation:', request.Op,
      request.Path || '(no path)',
      request.Input ? request.Input.Type : '(no input)',
      request.Dest || '(no dest)');

    const operation = this.ops.get(request.Op);
    if (operation) {
      return operation.call(this, request);
    } else {
      throw new Error(`Server doesn't implement ${request.Op} operation`);
    }
  }
}
