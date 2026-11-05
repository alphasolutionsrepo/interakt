// src/features/tools/tools.executor.data-source-search.logging.test.ts

/**
 * A chat tool's search on a managed index that fails is passed on by the data source
 * search, so the executor retries it and logs it once after its last attempt, with the
 * error. The data source search logs only a data source it couldn't look up, which it
 * answers itself. Through the real executor and data source search: the search service
 * and the data source lookup are stubbed.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchError } from '@/features/search/search.types';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/features/telemetry', () => ({
  withSpan: (_opts: unknown, fn: (span: unknown) => unknown) => fn({ setAttribute: vi.fn(), addEvent: vi.fn(), setStatus: vi.fn(), recordException: vi.fn(), end: vi.fn() }),
  ATTR: new Proxy({}, { get: (_t, k) => String(k) }),
}));
const tool = vi.hoisted(() => ({
  id: 'tool-1', name: 'Search', slug: 'search', executorType: 'data_source', operation: 'search', dataSourceId: 'ds', isActive: true,
  executorConfig: {}, inputSchema: { type: 'object', properties: {} }, outputSchema: null, timeout: 30_000,
  retryConfig: { count: 1, backoff: 'fixed' as const, initialDelayMs: 1 }, fallbackConfig: null,
}));
vi.mock('./tools.service', () => ({ getToolById: async () => tool }));
vi.mock('@/features/secrets/secrets.service', () => ({ resolveSecret: vi.fn() }));
vi.mock('@/features/mcp-connection/mcp-tool-resolver', () => ({ isMcpToolId: () => false, parseMcpToolId: () => null }));
vi.mock('@/features/mcp-connection/mcp-executor', () => ({ executeMcpTool: vi.fn() }));
const search = vi.hoisted(() => ({ searchById: vi.fn(), resolveDataSource: vi.fn() }));
vi.mock('@/features/search/search.service', () => ({ searchById: search.searchById, getExperienceContext: () => undefined }));
vi.mock('@/features/analytics', () => ({ trackSearch: vi.fn() }));
vi.mock('./executors/data-source/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./executors/data-source/shared')>()),
  resolveDataSource: search.resolveDataSource,
}));

import { executeTool } from './tools.executor';

beforeEach(() => {
  logs.length = 0;
  search.searchById.mockReset();
  search.resolveDataSource.mockReset().mockResolvedValue({ kind: 'managed', searchIndexId: 'i1', dataSourceId: 'ds' });
});

describe('a chat tool search on a managed index', () => {
  it("that the search engine couldn't take is retried and logged once, by the executor, as an error, with the error", async () => {
    const refused = new esErrors.ConnectionError('connect ECONNREFUSED 127.0.0.1:9200', { meta: {} } as never);
    const down = new SearchError(refused.message, 'PROVIDER_ERROR', {}, { cause: refused });
    search.searchById.mockRejectedValue(down);

    const result = await executeTool('tool-1', { query: 'linen shirts' });

    expect(result.success).toBe(false);
    expect(search.searchById).toHaveBeenCalledTimes(2);
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', message: 'Tool execution failed', context: expect.objectContaining({ err: down }) })]);
  });

  it('whose data source is gone is answered as a failed call and logged once, by the data source search, as a warning', async () => {
    const missing = new Error('Data source not found: ds');
    search.resolveDataSource.mockRejectedValue(missing);

    const result = await executeTool('tool-1', { query: 'linen shirts' });

    expect(result.success).toBe(false);
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', message: 'Data source search failed', context: expect.objectContaining({ err: missing }) })]);
  });
});

describe('a chat tool search the search service failed', () => {
  it.each([
    ['stopped (an error with no message)', () => new esErrors.ConnectionError('', { meta: {} } as never)],
    ['timed out', () => new esErrors.TimeoutError('Request timed out', { meta: {} } as never)],
  ])('is retried when Elasticsearch was %s', async (_case, cause) => {
    search.searchById.mockRejectedValue(new SearchError(cause().message, 'PROVIDER_ERROR', {}, { cause: cause() }));

    await executeTool('tool-1', { query: 'linen shirts' });

    expect(search.searchById).toHaveBeenCalledTimes(2);
  });

  it('is not retried when it refused the request (a filter the model wrote)', async () => {
    search.searchById.mockRejectedValue(new SearchError('"abc" isn\'t a valid value for rating', 'INVALID_FILTER'));

    await executeTool('tool-1', { query: 'linen shirts' });

    expect(search.searchById).toHaveBeenCalledTimes(1);
  });
});
