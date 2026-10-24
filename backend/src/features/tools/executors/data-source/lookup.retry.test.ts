// src/features/tools/executors/data-source/lookup.retry.test.ts

/**
 * Find Record through executeTool: an engine error rejects out of the lookup, so executeTool
 * retries a transient one and labels a lasting one as a failed call. Returning the error as
 * a result instead would skip both.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/features/telemetry', () => ({
  withSpan: vi.fn((_opts: unknown, fn: (span: unknown) => unknown) =>
    fn({ setAttribute: vi.fn(), addEvent: vi.fn(), setStatus: vi.fn(), recordException: vi.fn(), end: vi.fn() }),
  ),
  ATTR: new Proxy({}, { get: (_t, k) => `alpha.${String(k).toLowerCase()}` }),
}));
const { getToolById, getDocumentByIdFromIndex, searchById } = vi.hoisted(() => ({
  getToolById: vi.fn(),
  getDocumentByIdFromIndex: vi.fn(),
  searchById: vi.fn(),
}));
vi.mock('../../tools.service', () => ({ getToolById }));
vi.mock('@/features/secrets/secrets.service', () => ({ resolveSecret: vi.fn() }));
vi.mock('@/features/search/search.service', () => ({ getDocumentByIdFromIndex, searchById }));
vi.mock('@/features/data-source/data-source.service', () => ({ getDataSourceById: vi.fn(async () => ({ schema: null })) }));
vi.mock('@/features/data-source/external-search/external-search.service', () => ({ getConnector: vi.fn() }));
vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  resolveDataSource: vi.fn(async () => ({ kind: 'managed', searchIndexId: 'idx' })),
}));
vi.mock('@/features/mcp-connection/mcp-tool-resolver', () => ({ isMcpToolId: () => false, parseMcpToolId: () => null }));
vi.mock('@/features/mcp-connection/mcp-executor', () => ({ executeMcpTool: vi.fn() }));

import { executeTool } from '../../tools.executor';

const findTool = {
  id: 'find-1',
  name: 'Catalog Find Record',
  slug: 'catalog-find',
  executorType: 'data_source',
  operation: 'lookup',
  dataSourceId: 'ds-1',
  isActive: true,
  executorConfig: {},
  inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  outputSchema: null,
  timeout: 30_000,
  retryConfig: { count: 2, backoff: 'exponential' as const, initialDelayMs: 1 },
  fallbackConfig: null,
};

describe('Find Record through executeTool', () => {
  beforeEach(() => {
    getToolById.mockResolvedValue(findTool);
    getDocumentByIdFromIndex.mockReset();
    searchById.mockReset();
  });

  it('retries a transient engine error on the key fetch', async () => {
    getDocumentByIdFromIndex
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ id: 'PROD-1', fields: { name: 'Crew Neck Sweater' } });

    const result = await executeTool('find-1', { id: 'PROD-1' });

    expect(result).toMatchObject({ success: true, retriesUsed: 1, data: { id: 'PROD-1' } });
  });

  it('retries a transient engine error on the search fallback', async () => {
    getDocumentByIdFromIndex.mockResolvedValue(null);
    searchById
      .mockRejectedValueOnce(new Error('503 Service Unavailable'))
      .mockResolvedValueOnce({ hits: [{ id: 'p2', source: { name: 'Crew Neck Sweater' } }] });

    const result = await executeTool('find-1', { id: 'Crew Neck Sweater' });

    expect(result).toMatchObject({ success: true, retriesUsed: 1, data: { id: 'p2', matchedBy: 'search_fallback' } });
  });

  it('labels a lasting engine error as a failed call, not as not found', async () => {
    getDocumentByIdFromIndex.mockResolvedValue(null);
    searchById.mockRejectedValue(new Error('503 Service Unavailable'));

    const result = await executeTool('find-1', { id: 'Crew Neck Sweater' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('503');
  });
});
