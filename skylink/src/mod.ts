export * from './api/index.ts';
export * from './devices/index.ts';
export * from './extensions/index.ts';

export * from './client.ts';
export * from './client-http.ts';
// export * from './client-messageport.ts';
export * from './client-websocket.ts';
export * from './core-ops.ts';
export * from './server.ts';

import { SkylinkClient } from "./client.ts";
import { StatelessHttpSkylinkClient } from "./client-http.ts";
import { WebsocketSkylinkClient } from "./client-websocket.ts";
export function interpretUrl(url: string): [SkylinkClient, string] {
  if (!url.includes('://')) throw new Error(`URLs are required`);
  const [scheme, _, host, ...path] = url.split('/');
  switch (scheme) {
    case 'https:':
    case 'http:': {
      const client = new StatelessHttpSkylinkClient(new URL('/~~export', url));
      return [client, '/'+path.join('/')];
    }
    case 'wss:':
    case 'ws:': {
      const client = new WebsocketSkylinkClient(new URL('/~~export/ws', url).toString());
      return [client, '/pub/'+path.join('/')];
    }
    default: throw new Error(`URL scheme ${scheme} not supported`);
  }
}
