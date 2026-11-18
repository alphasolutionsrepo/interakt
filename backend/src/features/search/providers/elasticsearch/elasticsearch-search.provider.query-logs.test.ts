// src/features/search/providers/elasticsearch/elasticsearch-search.provider.query-logs.test.ts

/**
 * A visitor's question reaches the Elasticsearch provider's log lines (including the
 * LOG_ES_QUERIES request log) only when the request may keep content (its telemetry level is
 * 'full'); otherwise the lines keep its length, or say the body was withheld.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Read once when the provider module loads
vi.hoisted(() => { process.env.LOG_ES_QUERIES = 'true'; });

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));

const es = vi.hoisted(() => ({ search: vi.fn(), get: vi.fn() }));
vi.mock('./elasticsearch.client', () => ({ getElasticsearchClient: () => ({ search: es.search, get: es.get }) }));

import { ElasticsearchSearchProvider } from './elasticsearch-search.provider';

import { clearAllTelemetryOverrides, initializeTelemetryConfig, runWithTelemetryLevel } from '@/features/telemetry/telemetry.config';
import type { LogLine } from '@/shared/test/log-recorder';

const QUESTION = 'blue linen shirt for my wedding';
const line = (message: string) => logs.find((l) => l.message === message);
const everything = () => JSON.stringify(logs);

const search = (searchType: 'lexical' | 'hybrid') => new ElasticsearchSearchProvider().search({
  context: {
    indexName: 'products',
    searchableFields: [{ fieldName: 'title', fieldType: 'text' }],
    defaultResponseFields: [],
    facetableFields: [],
    embedding: { fieldName: 'v', dimensions: 3 },
  },
  request: { query: QUESTION },
  searchType,
  queryEmbedding: [0.1, 0.2, 0.3],
} as never);

beforeEach(() => {
  logs.length = 0;
  es.search.mockReset().mockResolvedValue({ took: 1, hits: { hits: [], total: { value: 0, relation: 'eq' } } });
  initializeTelemetryConfig().enabled = true;
});
afterEach(() => {
  clearAllTelemetryOverrides();
  initializeTelemetryConfig().enabled = false;
});

describe('Elasticsearch search logs', () => {
  it('log the length, not the question, when the request may not keep content', async () => {
    await search('lexical');
    await search('hybrid');

    expect(line('Executing search')?.context).toMatchObject({ queryLength: QUESTION.length });
    expect(line('Executing custom hybrid search')?.context).toMatchObject({ queryLength: QUESTION.length });
    expect(line('Search context')?.context).toMatchObject({ queryLength: QUESTION.length });
    expect(everything()).not.toContain('linen');
  });

  it('log the question when the request may keep content', async () => {
    await runWithTelemetryLevel('full', async () => {
      await search('lexical');
      await search('hybrid');
    });

    expect(line('Executing search')?.context).toMatchObject({ query: QUESTION });
    expect(line('Executing custom hybrid search')?.context).toMatchObject({ query: QUESTION });
    expect(line('Search context')?.context).toMatchObject({ query: QUESTION });
  });
});

describe('the Elasticsearch request log (LOG_ES_QUERIES)', () => {
  it('withholds the request body when the request may not keep content', async () => {
    await search('lexical');

    const request = line('ES request');
    expect(request?.context).toMatchObject({ index: 'products', bodyWithheld: expect.any(String) });
    expect(request?.context).not.toHaveProperty('body');
    expect(everything()).not.toContain('linen');
  });

  it('writes the request body when the request may keep content', async () => {
    await runWithTelemetryLevel('full', () => search('lexical'));

    expect(line('ES request')?.context.body).toContain(QUESTION);
    expect(line('ES request')?.context).not.toHaveProperty('bodyWithheld');
  });

  it('leaves the query out of a failure when the request may not keep content', async () => {
    es.search.mockRejectedValue(new Error('engine down'));
    await search('lexical').catch(() => undefined);

    const failure = logs.find((l) => l.message === 'ES query failed' && l.service === 'es-query');
    expect(failure?.context).toMatchObject({ index: 'products', error: 'engine down' });
    expect(failure?.context).not.toHaveProperty('query');
    expect(everything()).not.toContain('linen');
  });

  it('keeps the query in a failure when the request may keep content', async () => {
    es.search.mockRejectedValue(new Error('engine down'));
    await runWithTelemetryLevel('full', () => search('lexical')).catch(() => undefined);

    const failure = logs.find((l) => l.message === 'ES query failed' && l.service === 'es-query');
    expect(failure?.context.query).toContain(QUESTION);
  });
});

describe('a failed document lookup (Find Record looks up what the visitor named)', () => {
  const NAMED = 'blue linen shirt';
  const lookup = () => new ElasticsearchSearchProvider().getDocument('products', NAMED);
  beforeEach(() => { es.get.mockReset().mockRejectedValue(new Error('engine down')); });

  it('logs the length of the value, not the value, when the request may not keep content', async () => {
    await lookup();

    expect(line('Failed to get document by ID')?.context).toMatchObject({ documentIdLength: NAMED.length });
    expect(everything()).not.toContain('linen');
  });

  it('logs the value when the request may keep content', async () => {
    await runWithTelemetryLevel('full', lookup);

    expect(line('Failed to get document by ID')?.context).toMatchObject({ documentId: NAMED });
  });
});
