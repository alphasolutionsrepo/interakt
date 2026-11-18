// src/features/search/search.service.query-logs.test.ts

/**
 * A visitor's question reaches the search service's log lines only when the request may keep
 * content (its telemetry level is 'full'); otherwise the lines keep its length. Search and
 * autocomplete run for real here, with the engine faked and every log line kept.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/features/ai-service', () => ({ generateEmbedding: vi.fn() }));
vi.mock('@/features/analytics', () => ({ trackSearch: vi.fn() }));
vi.mock('./search.tracing', () => ({
  traceSearch: (_meta: unknown, run: (span: { setAttribute: () => void }) => unknown) => run({ setAttribute: vi.fn() }),
}));
vi.mock('./response.normalizer', () => ({ normalizeSearchResponse: () => ({ hits: [], total: { value: 0 } }) }));
vi.mock('@/features/search-index/search-index.service', () => ({
  getSearchIndexById: vi.fn(async () => ({
    id: 'idx', name: 'products', isActive: true, status: 'active',
    fields: [{ fieldName: 'title', isAutocomplete: true, isSearchable: true }],
  })),
}));
vi.mock('./search-context.builder', () => ({
  buildSearchContext: () => ({ indexName: 'products', searchType: 'lexical', searchProvider: 'elasticsearch' }),
  supportsSemanticSearch: () => false,
}));
const { engineSearch, engineAutocomplete } = vi.hoisted(() => ({
  engineSearch: vi.fn(async () => ({ hits: [], total: 0 })),
  engineAutocomplete: vi.fn(async () => ({ hits: [] })),
}));
vi.mock('./providers', () => {
  const engine = { name: 'elasticsearch', search: engineSearch, autocomplete: engineAutocomplete };
  return { providerRegistry: { list: () => [engine], get: () => engine }, initializeSearchProviders: vi.fn() };
});

import { autocompleteById, searchById } from './search.service';

import { clearAllTelemetryOverrides, initializeTelemetryConfig, runWithTelemetryLevel } from '@/features/telemetry/telemetry.config';
import type { LogLine } from '@/shared/test/log-recorder';

const QUESTION = 'blue linen shirt for my wedding';
// Autocomplete keeps the first 20 characters of what was typed
const TYPED = QUESTION.substring(0, 20);
const line = (message: string) => logs.find((l) => l.message === message);
const everything = () => JSON.stringify(logs);

beforeEach(() => {
  logs.length = 0;
  initializeTelemetryConfig().enabled = true;
});
afterEach(() => {
  clearAllTelemetryOverrides();
  initializeTelemetryConfig().enabled = false;
});

describe('search logs', () => {
  it('log the length, not the question, when the request may not keep content', async () => {
    await searchById('idx', { query: QUESTION });
    engineSearch.mockRejectedValueOnce(new Error('engine down'));
    await expect(searchById('idx', { query: QUESTION })).rejects.toThrow();

    expect(line('Search completed')?.context).toMatchObject({ queryLength: QUESTION.length });
    expect(line('Search failed')?.context).toMatchObject({ queryLength: QUESTION.length });
    expect(everything()).not.toContain('linen');
  });

  it('log the length of a long question in full, though a kept question is cut to 50 characters', async () => {
    const long = `${QUESTION} in late spring, with matching trousers and a waistcoat`;
    await searchById('idx', { query: long });
    expect(line('Search completed')?.context).toMatchObject({ queryLength: long.length });

    logs.length = 0;
    await runWithTelemetryLevel('full', () => searchById('idx', { query: long }));
    expect(line('Search completed')?.context).toMatchObject({ query: long.substring(0, 50) });
  });

  it('log the question when the request may keep content', async () => {
    await runWithTelemetryLevel('full', async () => {
      await searchById('idx', { query: QUESTION });
      engineSearch.mockRejectedValueOnce(new Error('engine down'));
      await expect(searchById('idx', { query: QUESTION })).rejects.toThrow();
    });

    expect(line('Search completed')?.context).toMatchObject({ query: QUESTION });
    expect(line('Search failed')?.context).toMatchObject({ query: QUESTION });
  });
});

describe('autocomplete logs', () => {
  it('log the length of the whole text, not what was typed, when the request may not keep content', async () => {
    await autocompleteById('idx', { query: QUESTION });
    engineAutocomplete.mockRejectedValueOnce(new Error('engine down'));
    await expect(autocompleteById('idx', { query: QUESTION })).rejects.toThrow();

    expect(line('Autocomplete completed')?.context).toMatchObject({ queryLength: QUESTION.length });
    expect(line('Autocomplete failed')?.context).toMatchObject({ queryLength: QUESTION.length });
    expect(everything()).not.toContain('linen');
  });

  it('log what was typed when the request may keep content', async () => {
    await runWithTelemetryLevel('full', async () => {
      await autocompleteById('idx', { query: QUESTION });
      engineAutocomplete.mockRejectedValueOnce(new Error('engine down'));
      await expect(autocompleteById('idx', { query: QUESTION })).rejects.toThrow();
    });

    expect(line('Autocomplete completed')?.context).toMatchObject({ query: TYPED });
    expect(line('Autocomplete failed')?.context).toMatchObject({ query: TYPED });
  });
});
