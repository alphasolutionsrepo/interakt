// src/features/search-experience/experience-search.query-rewrite.test.ts

/**
 * Query understanding in an experience with a managed index and an external source:
 * the external engine gets the question as search terms (and the visitor's filters),
 * the managed index keeps its own filter interpretation, the two model calls run side
 * by side, and the step is on the trace. The real interpreter runs; only the model,
 * the engines and the database are faked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeExperienceSearch } from './experience-search';
import { searchExternalSourceForExperience } from './external-source-search';
import type { SearchExperienceWithIndexes } from './search-experience.types';

import type { SearchExperienceAIConfig } from '@/db/schema/search-experience.schema';
import * as aiService from '@/features/ai-service';
import * as searchService from '@/features/search/search.service';
import type { SearchRequest, SearchResponse } from '@/features/search/search.types';
import { ATTR } from '@/features/telemetry';
import { featureSwitchesStub } from '@/shared/test/feature-switches-stub';
import { type LogLine } from '@/shared/test/log-recorder';

type Step = { name: string; attributes: Record<string, unknown>; error?: string };
const telemetry = vi.hoisted(() => ({ steps: [] as Step[], content: false }));
vi.mock('@/features/telemetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/telemetry')>()),
  shouldLogContent: () => telemetry.content,
  withSpan: async (opts: { name: string; attributes?: Record<string, unknown>; errorFor?: (r: unknown) => string | undefined }, fn: (span: unknown) => Promise<unknown>) => {
    const step: Step = { name: opts.name, attributes: { ...opts.attributes } };
    telemetry.steps.push(step);
    const result = await fn({ setAttribute: (key: string, value: unknown) => { step.attributes[key] = value; } });
    // What the real withSpan would set as the step's error status
    step.error = opts.errorFor?.(result);
    return result;
  },
}));

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/ai-service', () => ({ chat: vi.fn() }));
vi.mock('@/features/search/search.service', () => ({ searchById: vi.fn() }));
vi.mock('@/features/search-index/search-index.service', () => ({
  getSearchIndexById: vi.fn(async () => ({
    id: 'idx',
    fields: [
      { fieldName: 'title', fieldType: 'text', isIndexed: true, isFacetable: false },
      { fieldName: 'year', fieldType: 'number', isIndexed: true, isFacetable: false },
    ],
  })),
}));
vi.mock('@/features/data-source/data-source.service', () => ({
  getDataSourceById: vi.fn(async () => ({ id: 'ds', schema: { fields: [] } })),
}));
vi.mock('./external-source-search', () => ({
  externalFacetableFields: () => [],
  searchExternalSourceForExperience: vi.fn(),
}));

const QUESTION = 'how do I apply for financial aid as a transfer student';
const CLIENT_FILTERS = [{ field: 'section', operator: 'eq', value: 'admissions' }];

const emptyResponse = (): SearchResponse => ({ hits: [], total: { value: 0, relation: 'eq' }, took: 1 } as SearchResponse);

let counter = 0;
function experience(ai: Partial<SearchExperienceAIConfig['queryUnderstanding']> = {}, sources: 'both' | 'external' = 'both'): SearchExperienceWithIndexes {
  counter += 1;
  return {
    id: `exp-qr-${counter}`,
    slug: 'site',
    searchConfig: { enableFacets: false, defaultPageSize: 10, maxPageSize: 50 },
    aiConfig: {
      enabled: true,
      providerId: null,
      modelId: null,
      summary: { enabled: false, maxResultsForContext: 10 },
      queryUnderstanding: { enabled: true, minWords: 3, ...ai },
    },
    indexes: sources === 'both'
      ? [{ searchIndexId: 'idx', weight: 1, searchIndex: { id: `idx-${counter}`, name: 'pages', displayName: 'Pages', isActive: true } }]
      : [],
    externalSources: [{ dataSourceId: 'ds', weight: 1, dataSource: { id: 'ds', name: 'Site search', isActive: true } }],
  } as unknown as SearchExperienceWithIndexes;
}

/** The model call each step makes, told apart by the response schema it asks for. */
type Pending = { kind: string; resolve: (content: string) => void };
let pending: Pending[] = [];
function modelHolds() {
  vi.mocked(aiService.chat).mockImplementation((_messages, options) => new Promise((resolve) => {
    const kind = options?.responseFormat?.type === 'json_schema' ? options.responseFormat.json_schema.name : 'unknown';
    pending.push({ kind, resolve: (content) => resolve({ message: { content } } as never) });
  }));
}
function modelAnswers() {
  vi.mocked(aiService.chat).mockImplementation(async (_messages, options) => {
    const kind = options?.responseFormat?.type === 'json_schema' ? options.responseFormat.json_schema.name : 'unknown';
    const content = kind === 'query_rewrite'
      ? JSON.stringify({ query: 'apply financial aid transfer student' })
      : JSON.stringify({ query: 'financial aid transfer', filters: [{ field: 'year', operator: 'eq', value: 2026 }] });
    return { message: { content } } as never;
  });
}

const managedRequest = () => vi.mocked(searchService.searchById).mock.calls[0]?.[1] as SearchRequest | undefined;
const externalRequest = () => vi.mocked(searchExternalSourceForExperience).mock.calls[0]?.[2];
const search = (exp: SearchExperienceWithIndexes) =>
  executeExperienceSearch(exp, { query: QUESTION, filters: CLIENT_FILTERS } as never, { source: 'api' });

beforeEach(() => {
  vi.clearAllMocks();
  featureSwitchesStub.reset();
  telemetry.steps = [];
  telemetry.content = false;
  pending = [];
  vi.mocked(searchService.searchById).mockResolvedValue(emptyResponse());
  vi.mocked(searchExternalSourceForExperience).mockResolvedValue(emptyResponse());
});

describe('an experience with a managed index and an external source', () => {
  it('sends the external engine the search terms and the visitor’s filters; the managed index keeps its interpretation', async () => {
    modelAnswers();
    await search(experience());

    expect(externalRequest()).toMatchObject({ query: 'apply financial aid transfer student', filters: CLIENT_FILTERS });
    expect(managedRequest()).toMatchObject({
      query: 'financial aid transfer',
      filters: [...CLIENT_FILTERS, { field: 'year', operator: 'eq', value: 2026 }],
    });
  });

  it("hands both engines the visitor's words for analytics, next to what each searched", async () => {
    modelAnswers();
    await search(experience());

    expect(vi.mocked(searchService.searchById).mock.calls[0]?.[2]).toMatchObject({ visitorQuery: QUESTION });
    expect(vi.mocked(searchExternalSourceForExperience).mock.calls[0]?.[5]).toBe(QUESTION);
  });

  it('starts both model calls before either answers', async () => {
    modelHolds();
    const running = search(experience());

    await vi.waitFor(() => expect(pending.map((p) => p.kind).sort()).toEqual(['query_interpretation', 'query_rewrite']));
    for (const p of pending) {
      p.resolve(p.kind === 'query_rewrite'
        ? JSON.stringify({ query: 'apply financial aid transfer student' })
        : JSON.stringify({ query: 'financial aid transfer', filters: [] }));
    }
    await running;
    expect(externalRequest()?.query).toBe('apply financial aid transfer student');
  });

  it('searches the external engine with the visitor’s words when the rewrite times out', async () => {
    vi.mocked(aiService.chat).mockImplementation(() => new Promise(() => {}));
    const startedAt = Date.now();
    await search(experience({ timeoutMs: 500 }));

    expect(Date.now() - startedAt).toBeLessThan(1500);
    expect(externalRequest()).toMatchObject({ query: QUESTION, filters: CLIENT_FILTERS });
    expect(managedRequest()).toMatchObject({ query: QUESTION, filters: CLIENT_FILTERS });
    const step = telemetry.steps.find((s) => s.name === 'query_understanding.rewrite');
    expect(step?.attributes[ATTR.QUERY_REWRITE_OUTCOME]).toBe('timed_out');
    // The step ends in error even though the search carried on
    expect(step?.error).toMatch(/time limit/);
  });

  it('ends the step in error when the rewrite fails', async () => {
    vi.mocked(aiService.chat).mockRejectedValue(new Error('model down'));
    await search(experience({}, 'external'));
    expect(telemetry.steps.find((s) => s.name === 'query_understanding.rewrite')?.error).toMatch(/failed/);
  });

  it.each([
    ['rewritten', {}, 'apply financial aid transfer student'],
    ['unchanged', {}, QUESTION],
    ['skipped', { minWords: 20 }, 'unused'],
  ] as const)('ends the step OK when the outcome is %s', async (outcome, settings, answer) => {
    vi.mocked(aiService.chat).mockResolvedValue({ message: { content: JSON.stringify({ query: answer }) } } as never);
    await search(experience(settings, 'external'));
    const step = telemetry.steps.find((s) => s.name === 'query_understanding.rewrite');
    expect(step?.attributes[ATTR.QUERY_REWRITE_OUTCOME]).toBe(outcome);
    expect(step?.error).toBeUndefined();
  });
});

describe('query understanding steps in Analytics', () => {
  it('are named outside the prefixes Analytics counts as searches, so one search stays one search', async () => {
    modelAnswers();
    await search(experience());

    const inner = telemetry.steps.filter((s) => s.name !== 'search_experience.search').map((s) => s.name).sort();
    expect(inner).toEqual(['query_understanding.interpretation', 'query_understanding.rewrite']);
    // Request-level traces and turn counts (chat.%, search_experience.%), and search demand (search.%)
    for (const name of inner) expect(name).not.toMatch(/^(chat|search_experience|search)\./);
  });
});

describe('the query interpretation trace step (managed indexes)', () => {
  const interpretationStep = () => telemetry.steps.find((s) => s.name === 'query_understanding.interpretation');

  it('records the outcome, duration and filters added, without the query below full', async () => {
    modelAnswers();
    await search(experience());

    expect(interpretationStep()?.attributes).toEqual({
      [ATTR.QUERY_INTERPRETATION_OUTCOME]: 'interpreted',
      [ATTR.QUERY_INTERPRETATION_DURATION_MS]: expect.any(Number),
      [ATTR.QUERY_INTERPRETATION_FILTERS_ADDED]: 1,
    });
    expect(interpretationStep()?.error).toBeUndefined();
  });

  it('records the query searched at full', async () => {
    modelAnswers();
    telemetry.content = true;
    await search(experience());
    expect(interpretationStep()?.attributes[ATTR.QUERY_INTERPRETATION_QUERY]).toBe('financial aid transfer');
  });

  it('ends in error, naming the time limit, when the model is slower than the limit', async () => {
    vi.mocked(aiService.chat).mockImplementation(() => new Promise(() => {}));
    await search(experience({ timeoutMs: 500 }));

    expect(managedRequest()).toMatchObject({ query: QUESTION, filters: CLIENT_FILTERS });
    expect(interpretationStep()?.attributes[ATTR.QUERY_INTERPRETATION_OUTCOME]).toBe('timed_out');
    expect(interpretationStep()?.error).toMatch(/time limit/);
  });

  it('ends in error when the model fails or answers with nothing usable', async () => {
    vi.mocked(aiService.chat).mockRejectedValue(new Error('model down'));
    await search(experience());
    expect(interpretationStep()?.attributes[ATTR.QUERY_INTERPRETATION_OUTCOME]).toBe('failed');
    expect(interpretationStep()?.error).toMatch(/failed/);

    telemetry.steps = [];
    vi.mocked(aiService.chat).mockResolvedValue({ message: { content: 'not json' } } as never);
    await search(experience());
    expect(interpretationStep()?.attributes[ATTR.QUERY_INTERPRETATION_OUTCOME]).toBe('failed');
  });

  it('records a skip, ending OK, when the query is shorter than the minimum words', async () => {
    modelAnswers();
    await search(experience({ minWords: 20 }));
    expect(interpretationStep()?.attributes[ATTR.QUERY_INTERPRETATION_OUTCOME]).toBe('skipped');
    expect(interpretationStep()?.error).toBeUndefined();
  });

  it('is absent with query understanding off, or with no managed index', async () => {
    modelAnswers();
    await search(experience({ enabled: false }));
    await search(experience({}, 'external'));
    expect(interpretationStep()).toBeUndefined();
  });
});

describe('the query rewrite trace step', () => {
  it('records the outcome and duration, without the text below full', async () => {
    modelAnswers();
    await search(experience({}, 'external'));

    const step = telemetry.steps.find((s) => s.name === 'query_understanding.rewrite');
    expect(step?.attributes).toEqual({
      [ATTR.QUERY_REWRITE_OUTCOME]: 'rewritten',
      [ATTR.QUERY_REWRITE_DURATION_MS]: expect.any(Number),
    });
    expect(step?.error).toBeUndefined();
  });

  it('records the visitor’s words and the search terms at full', async () => {
    modelAnswers();
    telemetry.content = true;
    await search(experience({}, 'external'));

    const step = telemetry.steps.find((s) => s.name === 'query_understanding.rewrite');
    expect(step?.attributes).toMatchObject({
      [ATTR.QUERY_REWRITE_OUTCOME]: 'rewritten',
      [ATTR.QUERY_REWRITE_ORIGINAL]: QUESTION,
      [ATTR.QUERY_REWRITE_REWRITTEN]: 'apply financial aid transfer student',
    });
  });

  it('records a skip when the query is shorter than the minimum words', async () => {
    modelAnswers();
    await search(experience({ minWords: 20 }, 'external'));

    expect(aiService.chat).not.toHaveBeenCalled();
    expect(externalRequest()?.query).toBe(QUESTION);
    expect(telemetry.steps.find((s) => s.name === 'query_understanding.rewrite')?.attributes[ATTR.QUERY_REWRITE_OUTCOME]).toBe('skipped');
  });

  it('is absent, and the query is sent as typed, with query understanding off', async () => {
    modelAnswers();
    await search(experience({ enabled: false }, 'external'));

    expect(aiService.chat).not.toHaveBeenCalled();
    expect(externalRequest()).toMatchObject({ query: QUESTION, filters: CLIENT_FILTERS });
    expect(telemetry.steps.map((s) => s.name)).toEqual(['search_experience.search']);
  });
});
