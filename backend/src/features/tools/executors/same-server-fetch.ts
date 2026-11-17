// src/features/tools/executors/same-server-fetch.ts

/**
 * A tool's call to its API, following redirects only on the same server. fetch on its own
 * follows a redirect anywhere and sends the tool's own headers (an API key) along, so a
 * redirect to another server is refused instead and nothing more is sent.
 */

/** The API answered with a redirect to another server: not followed, and not worth a retry. */
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
  let current = new URL(url);
  let request = init;
  for (let redirects = 0; ; redirects++) {
    const response = await fetch(current.href, { ...request, redirect: 'manual' });
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) return response;
    await response.body?.cancel();

    const next = new URL(location, current);
    if (!sameServer(current, next)) {
      throw new RedirectedElsewhereError(`The API redirected to another server (${next.host}); the tool calls only the server in its URL`);
    }
    if (redirects >= MAX_REDIRECTS) throw new RedirectedElsewhereError(`The API redirected more than ${MAX_REDIRECTS} times`);
    // As browsers do: 303, and 301/302 after a POST, continue as a GET without the body
    const asGet = response.status === 303 || ((response.status === 301 || response.status === 302) && request.method === 'POST');
    if (asGet) request = { ...request, method: 'GET', body: undefined };
    current = next;
  }
}
