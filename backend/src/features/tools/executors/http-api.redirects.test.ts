// src/features/tools/executors/http-api.redirects.test.ts

/**
 * An HTTP tool follows its API's redirects only on the same server: a redirect to another
 * server is refused and nothing (the tool's API key included) is sent there. Real fetch against
 * two local servers ("127.0.0.1" and "localhost" are different servers to a URL).
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { executeHttpApi } from './http-api';

vi.mock('@/features/secrets/secrets.service', () => ({ resolveSecret: async () => 'sk-orders' }));

type Seen = { method?: string; url?: string; key?: string };
let apiSeen: Seen[] = [];
let elsewhereSeen: Seen[] = [];
let api: http.Server;
let elsewhere: http.Server;
let apiPort = 0;
let elsewherePort = 0;

const listen = (server: http.Server) => new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));

beforeAll(async () => {
  elsewhere = http.createServer((req, res) => {
    elsewhereSeen.push({ method: req.method, url: req.url, key: req.headers['x-api-key'] as string | undefined });
    res.end(JSON.stringify({ items: [{ id: 'elsewhere' }] }));
  });
  elsewherePort = await listen(elsewhere);
  api = http.createServer((req, res) => {
    apiSeen.push({ method: req.method, url: req.url, key: req.headers['x-api-key'] as string | undefined });
    if (req.url === '/away') { res.writeHead(302, { Location: `http://localhost:${elsewherePort}/collect` }); return res.end(); }
    if (req.url === '/moved') { res.writeHead(301, { Location: '/v2/orders' }); return res.end(); }
    if (req.url === '/created') { res.writeHead(303, { Location: '/v2/orders' }); return res.end(); }
    if (req.url === '/other-port') { res.writeHead(302, { Location: `http://127.0.0.1:${elsewherePort}/collect` }); return res.end(); }
    if (req.url === '/temporary') { res.writeHead(307, { Location: '/v2/orders' }); return res.end(); }
    if (req.url === '/loop') { res.writeHead(302, { Location: '/loop' }); return res.end(); }
    res.end(JSON.stringify({ items: [{ id: 'A-1' }] }));
  });
  apiPort = await listen(api);
});
afterAll(() => { api.close(); elsewhere.close(); });
beforeEach(() => { apiSeen = []; elsewhereSeen = []; });

const tool = (path: string, method = 'GET') => ({
  baseUrl: `http://127.0.0.1:${apiPort}${path}`,
  method,
  ...(method === 'POST' && { bodyTemplate: { note: 'x' } }),
  responseMapping: { resultsPath: '$.items' },
  authentication: { type: 'header', key: 'X-API-Key', valueRef: 'orders_key' },
});

describe('a redirect to another server', () => {
  it('is refused, and nothing is sent there', async () => {
    const result = await executeHttpApi(tool('/away'), {});
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/redirected to another server/) });
    expect(elsewhereSeen).toEqual([]);
  });
});

describe('a redirect to another port on the same host', () => {
  it('is refused, and nothing is sent there', async () => {
    const result = await executeHttpApi(tool('/other-port'), {});
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/redirected to another server/) });
    expect(elsewhereSeen).toEqual([]);
  });
});

describe('a refused redirect', () => {
  it('is not tried again', async () => {
    await executeHttpApi({ ...tool('/away'), retries: 2 }, {});
    expect(apiSeen).toHaveLength(1);
  });
});

describe('a redirect on the same server', () => {
  it('keeps a POST and its body after a 307', async () => {
    await executeHttpApi(tool('/temporary', 'POST'), {});
    expect(apiSeen.map((s) => s.method)).toEqual(['POST', 'POST']);
  });

  it('is followed, with the key', async () => {
    const result = await executeHttpApi(tool('/moved'), {});
    expect(result).toMatchObject({ success: true, data: { results: [{ id: 'A-1' }] } });
    expect(apiSeen.at(-1)).toEqual({ method: 'GET', url: '/v2/orders', key: 'sk-orders' });
  });

  it('continues a POST as a GET after a 303', async () => {
    await executeHttpApi(tool('/created', 'POST'), {});
    expect(apiSeen.map((s) => s.method)).toEqual(['POST', 'GET']);
  });

  it('stops after five', async () => {
    const result = await executeHttpApi(tool('/loop'), {});
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/more than 5 times/) });
    expect(apiSeen).toHaveLength(6);
  });
});
