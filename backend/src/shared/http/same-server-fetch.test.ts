// src/shared/http/same-server-fetch.test.ts

/**
 * Moving from http to https counts as the same server only on the standard ports: from any
 * other port it can be another service, so it is refused. (The redirect cases on real local
 * servers are in http-api.redirects.test.ts; https is faked here.)
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

/**
 * The redirect rules on a real local server: where a redirect is followed, what method and
 * body go with it, and when it stops. The server redirects by path (/status/<code>/to/final)
 * and records every request it gets.
 */
describe('redirects on the same server', () => {
  type Hit = { method?: string; url?: string; body: string };
  let hits: Hit[] = [];
  let server: http.Server;
  let base = '';

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        hits.push({ method: req.method, url: req.url, body });
        // Redirects go to a fixed path, never one taken from the request
        const redirect = /^\/status\/(\d+)\/to\/final$/.exec(req.url ?? '');
        if (redirect) { res.writeHead(Number(redirect[1]), { location: '/final' }); return res.end(); }
        if (req.url === '/no-location') { res.writeHead(302); return res.end(); }
        if (req.url === '/loop') { res.writeHead(302, { location: '/loop' }); return res.end(); }
        if (req.url === '/missing') { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":"nope"}'); }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"answer":"found"}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server.close(); });
  beforeEach(() => { hits = []; });

  const post = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"q":"a visitor question"}' };

  it('follows a relative Location to the same server', async () => {
    const response = await fetchOnSameServer(`${base}/status/302/to/final`, { method: 'GET' });
    expect(await response.json()).toEqual({ answer: 'found' });
    expect(hits.map((h) => h.url)).toEqual(['/status/302/to/final', '/final']);
  });

  it('continues a 303 after a POST as a GET without the body', async () => {
    await fetchOnSameServer(`${base}/status/303/to/final`, post);
    expect(hits).toEqual([
      { method: 'POST', url: '/status/303/to/final', body: post.body },
      { method: 'GET', url: '/final', body: '' },
    ]);
  });

  it.each([301, 302])('continues a %i after a POST as a GET without the body', async (status) => {
    await fetchOnSameServer(`${base}/status/${status}/to/final`, post);
    expect(hits[1]).toEqual({ method: 'GET', url: '/final', body: '' });
  });

  it.each([307, 308])('keeps the method and the body on a %i', async (status) => {
    await fetchOnSameServer(`${base}/status/${status}/to/final`, post);
    expect(hits[1]).toEqual({ method: 'POST', url: '/final', body: post.body });
  });

  it('returns a redirect without a Location as it is', async () => {
    const response = await fetchOnSameServer(`${base}/no-location`, { method: 'GET' });
    expect(response.status).toBe(302);
    expect(hits).toHaveLength(1);
  });

  it('returns an answer that is not a redirect untouched, its body readable', async () => {
    const response = await fetchOnSameServer(`${base}/missing`, { method: 'GET' });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'nope' });
    expect(hits).toHaveLength(1);
  });

  it('stops after 5 redirects on the same server', async () => {
    const error = await fetchOnSameServer(`${base}/loop`, { method: 'GET' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RedirectedElsewhereError);
    expect((error as Error).message).toMatch(/more than 5 times/);
    expect(hits).toHaveLength(6);
  });

  it('refuses a redirect to another host, and never makes the second request', async () => {
    const other = 'http://localhost:9'; // another origin than 127.0.0.1: must not be contacted
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: `${other}/x` } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchOnSameServer(`${base}/a`, { method: 'GET' })).rejects.toThrow(/another server \(localhost:9\)/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });
});
