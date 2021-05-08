import { Environment } from "./api/environment.ts";
import { SkylinkServer } from "./server.ts";

/**
 * The Skylink environment that is exposed to Deno Deploy requests.
 * Bind your endpoints into this when starting up.
 */
export const PublicEnvironment = new Environment();

// addEventListener("fetch",
/**
 * The listener that responds to requests.
 * Register this when starting up: `addEventListener("fetch", FetchListener);`
 */
export async function FetchListener(event: Event) {
  const request = (event as any).request as Request;
  const response = await handleRequest(request).catch(renderError);
  response.headers.set("server", `Stardustapp-Typescript/0.1.0 Deno/${Deno.version}`);
  (event as any).respondWith(response);
};


function renderError(err: Error) {
  const msg = err.stack || err.message || JSON.stringify(err);
  console.error('!!!', msg);
  return new Response(`Internal Error!
Feel free to try a second attempt.
File any issues here: https://github.com/stardustapp/dust-typescript/issues
Internal stacktrace follows:
${msg}`, {status: 500});
}

async function handleRequest(request: Request): Promise<Response> {
  const {pathname} = new URL(request.url);

  if (pathname === '/~~export' || pathname === '/~~export/') {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', {status: 405});
    }

    const input = await request.json();
    // console.log('export POST:', ctx.request.body);
    if (input == null) return new Response(
      `Request body is required for POST`, {status: 400});
    if (typeof input.Op !== 'string') return new Response(
      `"Op" field is required in POST`, {status: 400});

    const skylinkServer = new SkylinkServer(PublicEnvironment);
    // uses processFrame - doesn't support request-intercepting extensions
    return jsonResponse(await skylinkServer.processFrame(input));
  }

  if (pathname === '/~~export/ping') {
    if (request.method !== 'HEAD' && request.method !== 'GET') {
      return new Response('Method Not Allowed', {status: 405});
    }

    return jsonResponse({ Ok: true });
  }

  return new Response('Not Found', {status: 404});
}

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: new Headers({
      'content-type': 'application/json',
    }),
  });
}
