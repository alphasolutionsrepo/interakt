// src/shared/http/same-server-fetch.ts

/**
 * A server call to an address the admin set (an HTTP tool's API, an AI provider, an external
 * search source, an MCP server, web search), following redirects only on the same server.
 * fetch on its own follows a redirect anywhere and sends the request's own headers (an API
 * key) and body along, so a redirect to another server is refused instead and nothing more
 * is sent.
 */

/** The server answered with a redirect to another server: not followed, and not worth a retry. */
export class RedirectedElsewhereError extends Error {}

const MAX_REDIRECTS = 5;

/**
 * Same server: same scheme, host and port, or the same host moving from http to https on the
 * standard ports (80 to 443). Any other port can be another service.
 */
function sameServer(from: URL, to: URL): boolean {
  if (from.origin === to.origin) return true;
  return from.protocol === 'http:' && to.protocol === 'https:' && from.hostname === to.hostname
    && from.port === '' && to.port === '';
}

export async function fetchOnSameServer(url: string, init: RequestInit): Promise<Response> {
  // Read as a URL only once a redirect needs comparing: fetch itself rejects one it can't read
  let current = url;
  let request = init;
  for (let redirects = 0; ; redirects++) {
    const response = await fetch(current, { ...request, redirect: 'manual' });
    if (!(response.status >= 300 && response.status < 400)) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    await response.body?.cancel();

    const from = new URL(current);
    const next = new URL(location, from);
    if (!sameServer(from, next)) {
      throw new RedirectedElsewhereError(`The server redirected to another server (${next.host}); Interakt follows redirects only on the same server`);
    }
    if (redirects >= MAX_REDIRECTS) throw new RedirectedElsewhereError(`The server redirected more than ${MAX_REDIRECTS} times`);
    // As browsers do: 303, and 301/302 after a POST, continue as a GET without the body
    const asGet = response.status === 303 || ((response.status === 301 || response.status === 302) && request.method === 'POST');
    if (asGet) request = { ...request, method: 'GET', body: undefined };
    current = next.href;
  }
}
