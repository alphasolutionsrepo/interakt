// src/features/tools/tools.executor.secret-value-text.test.ts

/**
 * A secret's value goes into a tool's settings exactly as stored, whatever characters it has.
 * "$&", "$'", "$`" and "$$" are special in a JavaScript string replacement; a value with them
 * must still arrive unchanged in the request.
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

const { vault } = vi.hoisted(() => ({ vault: new Map<string, string>() }));
vi.mock('@/features/secrets/secrets.service', () => ({
  resolveSecret: vi.fn(async (name: string) => vault.get(name) ?? null),
}));

import { executeTool } from './tools.executor';

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ items: [] }), { status: 200 }));
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockClear(); getToolById.mockReset(); vault.clear(); });

const httpTool = (headers: Record<string, string>) => ({
  id: 'tool-1',
  name: 'Orders',
  slug: 'orders',
  executorType: 'http',
  operation: null,
  dataSourceId: null,
  isActive: true,
  executorConfig: { baseUrl: 'https://api.example.com/orders', method: 'GET', headers, responseMapping: { resultsPath: '$.items' } },
  inputSchema: { type: 'object', properties: {} },
  outputSchema: null,
  timeout: 30_000,
  retryConfig: null,
  fallbackConfig: null,
});

const sentHeader = (name: string) => new Headers(fetchMock.mock.lastCall?.[1]?.headers).get(name);

describe('a secret whose value has characters that are special in a text replacement', () => {
  it.each([
    ['$&', 'ab$&cd'],
    ["$'", "ab$'cd"],
    ['$`', 'ab$`cd'],
    ['$$', 'ab$$cd'],
    ['$1', 'ab$1cd'],
  ])('is sent exactly as stored when it contains %s', async (_chars, value) => {
    vault.set('api_token', value);
    getToolById.mockResolvedValue(httpTool({ Authorization: 'Bearer {{secret:api_token}} v1' }));

    const result = await executeTool('tool-1', {});

    expect(result.success).toBe(true);
    expect(sentHeader('Authorization')).toBe(`Bearer ${value} v1`);
  });

  it('fills two secrets in one value, each exactly as stored', async () => {
    vault.set('user', 'u$&1');
    vault.set('pass', "p$'2");
    getToolById.mockResolvedValue(httpTool({ 'X-Login': '{{secret:user}}:{{secret:pass}}' }));

    const result = await executeTool('tool-1', {});

    expect(result.success).toBe(true);
    expect(sentHeader('X-Login')).toBe("u$&1:p$'2");
  });
});
