// src/features/tools/executors/same-server-fetch.test.ts

/**
 * Moving from http to https counts as the same server only on the standard ports: from any
 * other port it can be another service, so it is refused. (The redirect cases on real local
 * servers are in http-api.redirects.test.ts; https is faked here.)
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchOnSameServer, RedirectedElsewhereError } from './same-server-fetch';

const redirectTo = (location: string) => new Response(null, { status: 301, headers: { location } });
afterEach(() => vi.unstubAllGlobals());

describe('a redirect from http to https on the same host', () => {
  it('is followed from the standard port', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(redirectTo('https://api.example.com/orders'))
      .mockResolvedValueOnce(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await fetchOnSameServer('http://api.example.com/orders', { method: 'GET' });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['http://api.example.com/orders', 'https://api.example.com/orders']);
  });

  it.each([
    ['another port', 'http://api.example.com:8080/orders', 'https://api.example.com/orders'],
    ['an https port of its own', 'http://api.example.com/orders', 'https://api.example.com:8443/orders'],
  ])('is refused from or to %s', async (_case, from, to) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(redirectTo(to));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchOnSameServer(from, { method: 'GET' })).rejects.toBeInstanceOf(RedirectedElsewhereError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
