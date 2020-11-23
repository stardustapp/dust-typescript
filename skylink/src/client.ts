import {
  InflateSkylinkLiteral, DeflateToSkylinkLiteral, Entry,
} from './api/entries/index.ts';
import { SkylinkExtension, SkyRequest, SkyResponse, WireRequest, WireResponse, WireType, WireTypeUnknown } from "./types.ts";

export interface SkylinkClient {
  ready?: Promise<void>;

  /////////////////////////////
  // Extension points

  outputDecoders: Array<(output: WireResponse) => Entry | null>;
  frameProcessors: Array<(frame: WireResponse) => boolean>;
  shutdownHandlers: Array<(input: Entry) => void>;
  extraInflaters: Map<string,(input: WireTypeUnknown) => Entry>;
  extraDeflaters: Map<string,(input: Entry) => WireTypeUnknown>;

  postMessage?(msg: unknown): unknown;

  /////////////////////////////
  // Public API

  attach(extension: SkylinkExtension<SkylinkClient>): void;
  handleShutdown(input: unknown): void;

  /**
   * Issues a request frame to the server and returns the result frame.
   * No checks are done on the status of the result frame itself,
   *   but if we fail to obtain a result, that will be thrown properly.
   */
  volley(request: WireRequest): Promise<SkyResponse>;

  /** Like volley(), except it checks the response and returns Output directly */
  performOp(request: WireRequest): Promise<Entry | undefined>;

  /** Called and implmeneted internally by stream-based implementations */
  processFrame(frame: SkyResponse): void;

  /////////////////////////////
  // Protected API for implementers

  makeRejectionMessage(request: WireRequest, output: Entry | undefined): string;
  encodeFrame(frame: SkyRequest): string;
  decodeOutput(frame: WireResponse): SkyResponse;
  receiveFrame(frame: WireResponse): void;
}

export class SkylinkClientBase implements SkylinkClient {
  constructor() {}

  /////////////////////////////
  // Extension points

  outputDecoders = new Array<(output: WireResponse) => Entry | null>();
  frameProcessors = new Array<(frame: WireResponse) => boolean>();
  shutdownHandlers = new Array<(input: unknown) => void>();
  extraInflaters = new Map<string,(input: WireTypeUnknown) => Entry>();
  extraDeflaters = new Map<string,(input: Entry) => WireTypeUnknown>();

  /////////////////////////////
  // Public API

  attach(extension: SkylinkExtension<SkylinkClient>) {
    extension.attachTo(this);
  }

  handleShutdown(input: unknown) {
    for (const handler of this.shutdownHandlers) {
      handler(input);
    }
  }

  // Issues a request frame to the server and returns the result frame
  // No checks are done on the status of the result frame itself,
  //   but if we fail to obtain a result, that will be thrown properly
  volley(request: WireRequest): Promise<SkyResponse> {
    throw new Error(`#TODO: impl volley() to do something lol`);
  }

  processFrame(frame: SkyResponse): void {
    throw new Error(`#TODO: impl volley() to do something lol`);
  }

  // Like volley(), except it checks the response and returns Output directly
  async performOp(request: WireRequest): Promise<Entry | undefined> {
    const response = await this.volley(request);
    switch (response.Ok) {
      case true:
        return response.Output;
      case false:
        const failErr = new Error(this
          .makeRejectionMessage(request, response.Output));
        (failErr as any).response = response;
        return Promise.reject(failErr);
      default:
        console.log('ERR: Bad server response, missing "Ok":', request, response);
        const err = new Error(`BUG: Skylink server response didn't have 'Ok'`);
        (err as any).response = response;
        return Promise.reject(err);
    }
  }

  /////////////////////////////
  // Protected API for implementers

  makeRejectionMessage(request: WireRequest, output: Entry | undefined) {
    let errorMessage = `"${request.Op}" operation wasn't Ok`;
    if (!output) return `${errorMessage}, and no error was returned!`;

    switch (output.Type) {
      case 'String':
        return `${errorMessage}: ${output.StringValue}`;
      case 'Error':
        console.error(`TODO: decode wire Error output:`, output);
        return `${errorMessage}: ${output.StringValue}`;
      default:
        return `${errorMessage}, and returned odd output type "${output.Type}"`;
    }
  }

  encodeFrame(frame: SkyRequest) {
    const prepped: WireRequest = { ...frame,
      Input: frame.Input ? DeflateToSkylinkLiteral(frame.Input, this.extraDeflaters) : undefined,
    };
    return JSON.stringify(prepped);
  }

  decodeOutput(frame: WireResponse): SkyResponse {
    // let extensions decode custom framing entirely
    // used for channels
    for (const decoder of this.outputDecoders) {
      const result = decoder(frame);
      if (result) return {
        ...frame,
        Output: result,
      };
    }

    // default to just simple transforms
    // used for strings, folders, plus extras
    return { ...frame,
      Output: frame.Output == undefined ? undefined : InflateSkylinkLiteral(frame.Output, this.extraInflaters),
    };
  }

  receiveFrame(frame: WireResponse) {
    // let extensions override the whole frame
    for (const processor of this.frameProcessors) {
      const result = processor(frame);
      if (result) return;
    }

    // fallback to just decoding the Output
    this.processFrame(this.decodeOutput(frame));
  }
}
