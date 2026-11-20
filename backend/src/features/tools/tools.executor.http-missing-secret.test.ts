// src/features/tools/tools.executor.http-missing-secret.test.ts

/**
 * Running a tool whose settings name a secret the vault can't give (URL, header, query
 * parameter or body of an HTTP tool, or another tool type's settings): the executor fills the
 * secrets it can, and the run fails naming each one left over, before anything is sent and
 * without a retry.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/features/telemetry', () => ({
  withSpan: vi.fn((_opts: unknown, fn: (span: unknown) => unknown) =>
    fn({ setAttribute: vi.fn(), addEvent: vi.fn(), setStatus: vi.fn(), recordException: vi.fn(), end: vi.fn() })),
  ATTR: new Proxy({}, { get: (_t, k) => `alpha.${String(k).toLowerCase()}` }),
}));

const { getToolById } = vi.hoisted(() => ({ getToolById: vi.fn() }));
vi.mock('./tools.service', () => ({ getToolById }));

// The vault has "orders_host"; "gone_host" is missing or can't be read
vi.mock('@/features/secrets/secrets.service', () => ({
  resolveSecret: vi.fn(async (name: string) => (name === 'orders_host' ? 'api.example.com' : null)),
}));

import { executeTool } from './tools.executor';

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ items: [] }), { status: 200 }));
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockClear(); getToolById.mockReset(); });

const httpTool = (baseUrl: string, extra: Record<string, unknown> = {}) => ({
  id: 'tool-1',
  name: 'Orders',
  slug: 'orders',
  executorType: 'http',
  operation: null,
  dataSourceId: null,
  isActive: true,
  executorConfig: { baseUrl, method: 'GET', responseMapping: { resultsPath: '$.items' }, ...extra },
  inputSchema: { type: 'object', properties: {} },
  outputSchema: null,
  timeout: 30_000,
  retryConfig: { count: 2, backoff: 'fixed' as const, initialDelayMs: 1 },
  fallbackConfig: null,
});

describe('an HTTP tool whose URL names a secret', () => {
  it.each([
    ['the host', 'https://{{secret:gone_host}}/orders'],
    ['the whole server address', '{{secret:gone_host}}/orders'],
    ['the path', 'https://api.example.com/{{secret:gone_host}}/orders'],
  ])('fails naming the secret, and sends nothing, when the vault can\'t give it for %s', async (_where, baseUrl) => {
    getToolById.mockResolvedValue(httpTool(baseUrl));
    const result = await executeTool('tool-1', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('The secret "gone_host" used in this tool\'s settings is missing from the Secrets Vault or can\'t be read');
    expect(result.error).not.toMatch(/fixed host/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the filled-in URL when the vault has the secret', async () => {
    getToolById.mockResolvedValue(httpTool('https://{{secret:orders_host}}/orders'));
    const result = await executeTool('tool-1', {});
    expect(result.success).toBe(true);
    expect(String(fetchMock.mock.lastCall?.[0])).toBe('https://api.example.com/orders');
  });
});

const MISSING = 'The secret "gone_key" used in this tool\'s settings is missing from the Secrets Vault or can\'t be read';

describe('a tool whose settings name a secret the vault can\'t give', () => {
  const url = 'https://api.example.com/orders';
  it.each([
    ['a header', { headers: { Authorization: 'Bearer {{secret:gone_key}}' } }],
    ['a query parameter', { queryParams: { key: '{{secret:gone_key}}' } }],
    ['the body template', { method: 'POST', bodyTemplate: { token: '{{secret:gone_key}}' } }],
  ])('fails naming the secret, once, and sends nothing, for %s', async (_where, extra) => {
    getToolById.mockResolvedValue(httpTool(url, extra));
    const result = await executeTool('tool-1', {});
    expect(result.success).toBe(false);
    expect(result.error).toBe(MISSING);
    expect(result.retriesUsed).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('names every missing secret, and never a value', async () => {
    getToolById.mockResolvedValue(httpTool(url, { headers: { A: '{{secret:gone_key}}', B: '{{secret:orders_host}}', C: '{{secret:gone_two}}' } }));
    const result = await executeTool('tool-1', {});
    expect(result.error).toContain('"gone_key"');
    expect(result.error).toContain('"gone_two"');
    expect(result.error).not.toContain('api.example.com');
  });

  it('sends a header whose secret the vault has', async () => {
    getToolById.mockResolvedValue(httpTool(url, { headers: { Authorization: 'Bearer {{secret:orders_host}}' } }));
    const result = await executeTool('tool-1', {});
    expect(result.success).toBe(true);
    expect((fetchMock.mock.lastCall?.[1]?.headers as Record<string, string>).Authorization).toBe('Bearer api.example.com');
  });

  it('fails a web search tool the same way', async () => {
    getToolById.mockResolvedValue({
      ...httpTool(url), executorType: 'web_search',
      executorConfig: { apiKeySecret: 'orders_host', includeDomains: ['{{secret:gone_key}}'] },
      inputSchema: null,
    });
    const result = await executeTool('tool-1', { query: 'x' });
    expect(result.success).toBe(false);
    expect(result.error).toBe(MISSING);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
