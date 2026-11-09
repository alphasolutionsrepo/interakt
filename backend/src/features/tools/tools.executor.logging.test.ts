// src/features/tools/tools.executor.logging.test.ts

/**
 * A tool call that fails is logged once, after its last attempt, with the error: at
 * error when a service on our side failed (the search engine is down during a chat
 * turn), otherwise as a warning. The search service passes the failure on for its
 * caller to log, so this is the line that says the engine was down.
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
  id: 'tool-1', name: 'Search', slug: 'search', executorType: 'http', operation: null, dataSourceId: null, isActive: true,
  executorConfig: {}, inputSchema: { type: 'object', properties: {} }, outputSchema: null, timeout: 30_000,
  retryConfig: { count: 1, backoff: 'fixed' as const, initialDelayMs: 1 }, fallbackConfig: null,
}));
vi.mock('./tools.service', () => ({ getToolById: async () => tool }));
vi.mock('@/features/secrets/secrets.service', () => ({ resolveSecret: vi.fn() }));
const run = vi.hoisted(() => ({ http: vi.fn() }));
vi.mock('./executors/http-api', () => ({ executeHttpApi: (...args: unknown[]) => run.http(...args) }));
vi.mock('./executors/web-search', () => ({ executeWebSearch: vi.fn() }));
vi.mock('./executors/ai-responder', () => ({ executeAiResponder: vi.fn() }));
vi.mock('./executors/data-source', () => ({ executeDataSourceSearch: vi.fn(), executeDataSourceInspect: vi.fn(), executeDataSourceEnumerate: vi.fn(), executeDataSourceLookup: vi.fn() }));
vi.mock('@/features/mcp-connection/mcp-tool-resolver', () => ({ isMcpToolId: () => false, parseMcpToolId: () => null }));
vi.mock('@/features/mcp-connection/mcp-executor', () => ({ executeMcpTool: vi.fn() }));

import { executeTool } from './tools.executor';

beforeEach(() => {
  logs.length = 0;
  run.http.mockReset();
});

describe('a tool call that fails', () => {
  it('because the search engine is down is logged once, as an error, with the error', async () => {
    // What the search service throws when Elasticsearch can't be reached
    const down = new SearchError('', 'PROVIDER_ERROR', {}, { cause: new esErrors.ConnectionError('', { meta: {} } as never) });
    run.http.mockRejectedValue(down);

    const result = await executeTool('tool-1', {});

    expect(result.success).toBe(false);
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', message: 'Tool execution failed', context: expect.objectContaining({ err: down }) })]);
  });

  it('for another reason is logged once, as a warning, with the error', async () => {
    const refused = new Error('The query needs a product name');
    run.http.mockRejectedValue(refused);

    await executeTool('tool-1', {});

    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ err: refused }) })]);
  });

  it('because the search engine refused the request (a filter the model wrote) is logged once, as a warning', async () => {
    const refused = new SearchError('"abc" isn\'t a valid value for rating', 'INVALID_FILTER');
    run.http.mockRejectedValue(refused);

    await executeTool('tool-1', {});

    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ err: refused }) })]);
  });
});
