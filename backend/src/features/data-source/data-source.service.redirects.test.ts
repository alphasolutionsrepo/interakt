// src/features/data-source/data-source.service.redirects.test.ts

/**
 * An external source whose address redirects to another server: the health check follows
 * redirects only on the same server, so nothing (a key header, a sampling request) reaches the
 * other one, and the check says why. Real health check on local servers; only the stored
 * source is faked. One server redirects every request; another answers the bare address (the
 * reachability probe) and redirects everything beneath it (stats, schema, sampling).
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ getDataSourceById: vi.fn(), updateDataSource: vi.fn(async () => ({})) }));
vi.mock('./data-source.repository', () => repository);
vi.mock('@/features/search-experience/search-experience.cache', () => ({ invalidateByDataSource: vi.fn() }));
vi.mock('@/features/search-index/search-index.repository', () => ({}));
vi.mock('@/features/secrets/secrets.service', () => ({ resolveSecret: vi.fn(async () => 'stored-secret') }));
vi.mock('@/features/tools/tools.service', () => ({}));

import { performHealthCheck } from './data-source.service';

type Hit = { method?: string; url?: string };
let redirected: Hit[] = [];
let reached: Hit[] = [];
let allRedirectorUrl = '';
let belowRootRedirectorUrl = '';
let samplingRedirectorUrl = '';
let servers: http.Server[] = [];

const listen = (server: http.Server) => new Promise<string>((resolve) =>
  server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));

beforeAll(async () => {
  const catcher = http.createServer((req, res) => { reached.push({ method: req.method, url: req.url }); res.end('{}'); });
  const catcherUrl = await listen(catcher);
  const redirect = (req: http.IncomingMessage, res: http.ServerResponse) => {
    redirected.push({ method: req.method, url: req.url });
    res.writeHead(307, { location: `${catcherUrl}${req.url}` });
    res.end();
  };
  const allRedirector = http.createServer(redirect);
  const belowRootRedirector = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '') return res.end('{}');
    redirect(req, res);
  });
  // Answers the probe and the field list (so the check goes on to sample documents) and redirects the rest
  const samplingRedirector = http.createServer((req, res) => {
    if (req.url === '/') return res.end('{}');
    if (req.url === '/products/_mapping') return res.end(JSON.stringify({ products: { mappings: { properties: { title: { type: 'text' } } } } }));
    if (req.url?.startsWith('/indexes/products?')) return res.end(JSON.stringify({ fields: [{ name: 'title', type: 'Edm.String', searchable: true, filterable: false, sortable: false, facetable: false, key: false }] }));
    redirect(req, res);
  });
  allRedirectorUrl = await listen(allRedirector);
  samplingRedirectorUrl = await listen(samplingRedirector);
  belowRootRedirectorUrl = await listen(belowRootRedirector);
  servers = [catcher, allRedirector, belowRootRedirector, samplingRedirector];
});
afterAll(() => { servers.forEach((s) => s.close()); });
beforeEach(() => { redirected = []; reached = []; });

const source = (provider: string, url: string, authType: 'none' | 'api_key' = 'none') => repository.getDataSourceById.mockResolvedValue({
  id: 'ds-1',
  type: 'search_index_external',
  config: { provider, connection: { url, indexName: 'products', authType, ...(authType === 'api_key' && { secretRef: 'key', headerName: 'api-key' }) } },
  schema: null,
});

describe.each([['elasticsearch'], ['azure_ai_search']])('a %s source at an address that redirects to another server', (provider) => {
  it('reports the refused redirect from the probe, with one request and no GET retry', async () => {
    source(provider, allRedirectorUrl);
    const result = await performHealthCheck('ds-1');
    expect(result.status).toBe('error');
    expect(result.message).toContain('redirected to another server');
    expect(redirected).toEqual([{ method: 'HEAD', url: '/' }]);
    expect(reached).toEqual([]);
  });

  it('sends nothing to the other server from stats, schema discovery or sampling', async () => {
    // The bare address answers, so the check goes on to read stats, the schema and sample documents
    source(provider, belowRootRedirectorUrl, 'api_key');
    const result = await performHealthCheck('ds-1');
    expect(result.message).toMatch(/schema discovery failed: .*redirected to another server/);
    expect(redirected.length).toBeGreaterThanOrEqual(2);
    expect(redirected.map((hit) => hit.url).join(' ')).toMatch(provider === 'elasticsearch' ? /_stats/ : /\/stats/);
    expect(reached).toEqual([]);
  });

  it('sends nothing to the other server from document sampling, and still reports the fields found', async () => {
    source(provider, samplingRedirectorUrl, 'api_key');
    const result = await performHealthCheck('ds-1');
    expect(result.message).toContain('1 fields discovered');
    expect(redirected.map((hit) => hit.url).join(' ')).toMatch(provider === 'elasticsearch' ? /_search/ : /docs\/search/);
    expect(reached).toEqual([]);
  });
});
