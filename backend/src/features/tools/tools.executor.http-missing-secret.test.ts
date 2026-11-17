// src/features/tools/tools.executor.http-missing-secret.test.ts

/**
 * Running an HTTP tool whose URL names a secret the vault can't give: the executor fills the
 * secrets it can, the HTTP executor finds the one left over, and the run fails naming it
 * before anything is sent.
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

const httpTool = (baseUrl: string) => ({
  id: 'tool-1',
  name: 'Orders',
  slug: 'orders',
  executorType: 'http',
  operation: null,
  dataSourceId: null,
  isActive: true,
  executorConfig: { baseUrl, method: 'GET', responseMapping: { resultsPath: '$.items' } },
  inputSchema: { type: 'object', properties: {} },
  outputSchema: null,
  timeout: 30_000,
  retryConfig: { count: 0, backoff: 'fixed' as const, initialDelayMs: 1 },
  fallbackConfig: null,
});

describe('an HTTP tool whose URL names a secret', () => {
  it('fails naming the secret, and sends nothing, when the vault can\'t give it', async () => {
    getToolById.mockResolvedValue(httpTool('https://{{secret:gone_host}}/orders'));
    const result = await executeTool('tool-1', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('The secret "gone_host" used in the URL is missing from the Secrets Vault or can\'t be read');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the filled-in URL when the vault has the secret', async () => {
    getToolById.mockResolvedValue(httpTool('https://{{secret:orders_host}}/orders'));
    const result = await executeTool('tool-1', {});
    expect(result.success).toBe(true);
    expect(String(fetchMock.mock.lastCall?.[0])).toBe('https://api.example.com/orders');
  });
});
