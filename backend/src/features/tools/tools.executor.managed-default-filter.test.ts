// src/features/tools/tools.executor.managed-default-filter.test.ts

/**
 * A chat tool's default filter is the admin's, on a managed index as on an external source:
 * when the engine refuses it, the tool's setup is at fault (logged as an error), not the
 * model's request (INVALID_FILTER, a warning). Through the real executor, data source
 * search, search service and engine providers: only the engines' clients answer, with
 * their own refusal, and the index lookup is stubbed.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AzureSearchProvider } from '@/features/search/providers/azure-ai-search/azure-search.provider';
import { ElasticsearchSearchProvider } from '@/features/search/providers/elasticsearch/elasticsearch-search.provider';
import { providerRegistry } from '@/features/search/providers/search-provider.interface';
import { SearchError } from '@/features/search/search.types';
import { reported, type LogLine } from '@/shared/test/log-recorder';

vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
const tool = vi.hoisted(() => ({
  id: 'tool-1', name: 'Search', slug: 'search', executorType: 'data_source', operation: 'search', dataSourceId: 'ds', isActive: true,
  executorConfig: {} as Record<string, unknown>, inputSchema: { type: 'object', properties: {} }, outputSchema: null, timeout: 30_000,
  retryConfig: { count: 0, backoff: 'fixed', initialDelayMs: 1 }, fallbackConfig: null,
}));
vi.mock('./tools.service', () => ({ getToolById: async () => tool }));
vi.mock('@/features/secrets/secrets.service', () => ({ resolveSecret: vi.fn() }));
vi.mock('@/features/mcp-connection/mcp-tool-resolver', () => ({ isMcpToolId: () => false, parseMcpToolId: () => null }));
vi.mock('@/features/mcp-connection/mcp-executor', () => ({ executeMcpTool: vi.fn() }));
vi.mock('@/features/analytics', () => ({ trackSearch: vi.fn() }));
vi.mock('./executors/data-source/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./executors/data-source/shared')>()),
  resolveDataSource: async () => ({ kind: 'managed', searchIndexId: 'idx', dataSourceId: 'ds' }),
}));
const index = vi.hoisted(() => ({ searchProvider: 'elasticsearch' }));
vi.mock('@/features/search-index/search-index.service', () => ({
  getSearchIndexById: async () => ({
    id: 'idx', name: 'products', isActive: true, status: 'active', searchType: 'lexical', searchProvider: index.searchProvider, language: 'english',
    fields: [
      { fieldName: 'title', fieldType: 'text', isMapped: true, isIndexed: true, isSearchable: true, includeInResponse: true, isFacetable: false, boostValue: 1 },
      { fieldName: 'rating', fieldType: 'integer', isMapped: true, isIndexed: true, isSearchable: false, includeInResponse: true, isFacetable: false, boostValue: 1 },
      { fieldName: 'colour', fieldType: 'keyword', isMapped: true, isIndexed: true, isSearchable: false, includeInResponse: true, isFacetable: false, boostValue: 1 },
    ],
  }),
}));
// The engines' own refusals: Elasticsearch couldn't read a value, Azure AI Search has no such field
const engine = vi.hoisted(() => ({ error: undefined as unknown }));
vi.mock('@/features/search/providers/elasticsearch/elasticsearch.client', () => ({
  getElasticsearchClient: () => ({ search: async () => { throw engine.error; } }),
}));
vi.mock('@/features/search/providers/azure-ai-search/azure-client', () => ({
  getSearchClient: () => ({ search: async () => { throw engine.error; } }),
  checkAzureHealth: vi.fn(),
}));

import { executeTool } from './tools.executor';

providerRegistry.register('elasticsearch', new ElasticsearchSearchProvider(), true);
providerRegistry.register('azure-ai-search', new AzureSearchProvider(), false);

const esRefusal = (reason: string) => new esErrors.ResponseError({
  body: { error: { type: 'search_phase_execution_exception', reason: 'all shards failed', root_cause: [{ reason }] }, status: 400 },
  statusCode: 400, headers: {}, meta: {} as never, warnings: null,
} as never);
const azureRefusal = (message: string) => Object.assign(new Error(message), { name: 'RestError', statusCode: 400 });

const engines = [
  {
    name: 'Elasticsearch', provider: 'elasticsearch', refusal: () => esRefusal('failed to create query: For input string: "abc"'),
    filter: { field: 'rating', operator: 'eq', value: 'abc' }, named: '"abc"',
  },
  {
    name: 'Azure AI Search', provider: 'azure-ai-search', refusal: () => azureRefusal("Invalid expression: Could not find a property named 'colour' on type 'search.document'."),
    filter: { field: 'colour', operator: 'eq', value: 'red' }, named: "'colour'",
  },
];

beforeEach(() => {
  logs.length = 0;
  tool.executorConfig = {};
});

describe.each(engines)('a chat tool search on a managed $name index', ({ provider, refusal, filter, named }) => {
  beforeEach(() => {
    index.searchProvider = provider;
    engine.error = refusal();
  });

  it("that refused the tool's own default filter is logged once, as an error: the admin's setup, not the model's request", async () => {
    tool.executorConfig = { defaultFilters: [filter] };

    const result = await executeTool('tool-1', { query: 'linen shirts' });

    expect(result.success).toBe(false);
    const lines = reported(logs);
    expect(lines).toEqual([expect.objectContaining({ level: 'error', message: 'Tool execution failed' })]);
    // Not blamed on the model: the engine's own reason, naming the default it refused
    const err = lines[0].context?.err as SearchError;
    expect(err).toBeInstanceOf(SearchError);
    expect(err.code).toBe('PROVIDER_ERROR');
    expect(err.message).toContain(named);
  });

  it('that refused the filter the model wrote is still logged once, as a warning, blamed on that filter', async () => {
    tool.executorConfig = { defaultFilters: [{ field: 'title', operator: 'eq', value: 'Linen' }] };

    const result = await executeTool('tool-1', { query: 'linen shirts', filters: [filter] });

    expect(result.success).toBe(false);
    const lines = reported(logs);
    expect(lines).toEqual([expect.objectContaining({ level: 'warn', message: 'Tool execution failed' })]);
    expect(lines[0].context?.err).toMatchObject({ code: 'INVALID_FILTER', details: { fields: [filter.field] } });
  });
});

describe('a chat tool search on a managed Elasticsearch index that refused the sort', () => {
  beforeEach(() => {
    index.searchProvider = 'elasticsearch';
    engine.error = esRefusal('No mapping found for [rating] in order to sort on');
  });

  it('the tool sorts by default is logged once, as an error, not blamed on the model', async () => {
    tool.executorConfig = { defaultSort: [{ field: 'rating', direction: 'desc' }] };

    await executeTool('tool-1', { query: 'linen shirts' });

    const lines = reported(logs);
    expect(lines).toEqual([expect.objectContaining({ level: 'error', message: 'Tool execution failed' })]);
    expect(lines[0].context?.err).toMatchObject({ code: 'PROVIDER_ERROR' });
  });

  it('the model asked for is still logged once, as a warning, blamed on that sort', async () => {
    await executeTool('tool-1', { query: 'linen shirts', sort: [{ field: 'rating', direction: 'desc' }] });

    const lines = reported(logs);
    expect(lines).toEqual([expect.objectContaining({ level: 'warn', message: 'Tool execution failed' })]);
    expect(lines[0].context?.err).toMatchObject({ code: 'INVALID_SORT', details: { fields: ['rating'] } });
  });
});
