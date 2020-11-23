import {SkylinkClient, SkylinkClientBase} from './client.ts';
import { WireRequest } from "./types.ts";

type FetchFunc = (input: string | URL, config: RequestInit) => Promise<Response>;

export class StatelessHttpSkylinkClient extends SkylinkClientBase implements SkylinkClient {
  constructor(endpoint: string | URL, fetch?: FetchFunc) {
    super();
    this.endpoint = endpoint;
    this.fetch = fetch ?? globalThis.fetch.bind(globalThis);
  }
  endpoint: string | URL;
  fetch: FetchFunc;

  async volley(request: WireRequest) {
    const resp = await this.fetch(this.endpoint, {
      method: 'POST',
      body: JSON.stringify(request),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (resp.status < 200 || resp.status >= 300)
      throw new Error(`Skylink op failed with HTTP ${resp.status}`);
    return this.decodeOutput(await resp.json());
  }
}
