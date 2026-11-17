// src/features/search-experience/query-interpreter.test.ts

/**
 * Query interpretation gating and caching.
 *
 * Two regressions are guarded here, both about LLM calls that should not happen
 * or should not be reused:
 *
 * 1. Interpretation ignored the experience's global "Enable AI Features" switch
 *    and keyed only off the nested queryUnderstanding flag. Turning AI off left
 *    the admin UI reporting "AI features are disabled" while every search kept
 *    making a paid model call.
 * 2. The interpretation cache key omitted the custom instructions that are fed
 *    into the prompt, so editing them served the stale interpretation for the
 *    rest of the 10-minute TTL.
 *
 * The service reaches a model and the DB, so both are mocked — the assertions
 * are about how often aiService.chat is reached, which is the whole point.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { featureSwitchesStub } from '@/shared/test/feature-switches-stub';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));

vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);

vi.mock('@/features/ai-service', () => ({
    chat: vi.fn(),
}));

vi.mock('@/features/search-index/search-index.service', () => ({
    getSearchIndexById: vi.fn(),
}));

vi.mock('@/features/search/search.service', () => ({
    searchById: vi.fn(),
}));

// Cache keys are logged with every cache log switch on, as in development
vi.mock('@/config/cache.config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/config/cache.config')>();
    return { cacheConfig: { ...actual.cacheConfig, logging: { logHits: true, logMisses: true, logOperations: true } } };
});

import * as aiService from '@/features/ai-service';
import * as searchIndexService from '@/features/search-index/search-index.service';
import * as searchService from '@/features/search/search.service';
import { SearchError } from '@/features/search/search.types';
import { applyQueryInterpretation } from './query-interpreter';
import { invalidateQueryInterpreterCache } from './query-interpreter.cache';
import type { SearchExperienceAIConfig } from '@/db/schema/search-experience.schema';

const QUERY = 'waterproof jackets under 200';

/** Non-facetable so loadFieldConstraints never reaches the facet-value lookup. */
const INDEX_FIELDS = [
    { fieldName: 'name', fieldType: 'text', isIndexed: true, isFacetable: false },
    { fieldName: 'price', fieldType: 'number', isIndexed: true, isFacetable: false },
];

function aiConfig(overrides: {
    enabled?: boolean;
    quEnabled?: boolean;
    customInstructions?: string;
} = {}): SearchExperienceAIConfig {
    return {
        enabled: overrides.enabled ?? true,
        providerId: null,
        modelId: null,
        summary: { enabled: true, maxResultsForContext: 10, maxTokens: 500 },
        queryUnderstanding: {
            enabled: overrides.quEnabled ?? true,
            minWords: 3,
            customInstructions: overrides.customInstructions,
        },
    } as SearchExperienceAIConfig;
}

/** A well-formed interpreter response: one filter the model extracted. */
function modelReplies(effectiveQuery = 'waterproof jackets') {
    vi.mocked(aiService.chat).mockResolvedValue({
        message: {
            content: JSON.stringify({
                query: effectiveQuery,
                filters: [{ field: 'price', operator: 'lte', value: 200 }],
            }),
        },
    } as unknown as Awaited<ReturnType<typeof aiService.chat>>);
}

/**
 * Each test uses its own index id: the module-level caches live for the whole
 * run, so sharing one would let an earlier test's entry answer a later one.
 */
let indexCounter = 0;
function freshIndexId(): string {
    indexCounter += 1;
    return `idx-${indexCounter}`;
}

beforeEach(() => {
    vi.clearAllMocks();
    featureSwitchesStub.reset();
    vi.mocked(searchIndexService.getSearchIndexById).mockResolvedValue(
        { id: 'idx', fields: INDEX_FIELDS } as unknown as Awaited<
            ReturnType<typeof searchIndexService.getSearchIndexById>
        >,
    );
    modelReplies();
});

describe('global AI switch', () => {
    it('skips interpretation entirely when AI features are off', async () => {
        const result = await applyQueryInterpretation({
            query: QUERY,
            clientFilters: undefined,
            searchIndexId: freshIndexId(),
            aiConfig: aiConfig({ enabled: false, quEnabled: true }),
            experienceId: 'exp-1',
        });

        expect(aiService.chat).not.toHaveBeenCalled();
        expect(result.query).toBe(QUERY);
        expect(result.filters).toBeUndefined();
    });

    it('skips interpretation when query understanding alone is off', async () => {
        const result = await applyQueryInterpretation({
            query: QUERY,
            clientFilters: undefined,
            searchIndexId: freshIndexId(),
            aiConfig: aiConfig({ enabled: true, quEnabled: false }),
            experienceId: 'exp-1',
        });

        expect(aiService.chat).not.toHaveBeenCalled();
        expect(result.query).toBe(QUERY);
    });

    it('skips interpretation when the AI summaries area is turned off', async () => {
        featureSwitchesStub.off.add('ai-summaries');
        const result = await applyQueryInterpretation({
            query: QUERY,
            clientFilters: [{ field: 'brand', operator: 'eq', value: 'x' }],
            searchIndexId: freshIndexId(),
            aiConfig: aiConfig(),
            experienceId: 'exp-1',
        });

        expect(aiService.chat).not.toHaveBeenCalled();
        expect(result).toEqual({ query: QUERY, filters: [{ field: 'brand', operator: 'eq', value: 'x' }] });
    });

    it("keeps the visitor's words, the query searched and filter values out of the application log, cache lines included", async () => {
        logs.length = 0;
        const searchIndexId = freshIndexId();
        const ask = () => applyQueryInterpretation({
            query: QUERY, clientFilters: undefined, searchIndexId, aiConfig: aiConfig(), experienceId: 'exp-1',
        });
        await ask();
        await ask();

        // The cache did log its keys, and the step logged its result
        expect(logs.some((l) => l.message.startsWith('Cache'))).toBe(true);
        expect(logs.some((l) => l.message === 'Query interpreted')).toBe(true);
        const text = JSON.stringify(logs);
        expect(text).not.toContain(QUERY);
        expect(text).not.toContain('waterproof jackets');
        expect(text).not.toContain('lte200');
    });

    it('searches with the raw query when the switch cannot be read, and reads it again on the next search', async () => {
        const switches = await import('@/features/feature-switches/feature-switches.service');
        vi.spyOn(switches, 'isAreaOn').mockRejectedValueOnce(new Error('settings store down'));
        const ask = () => applyQueryInterpretation({
            query: QUERY, clientFilters: undefined, searchIndexId: freshIndexId(), aiConfig: aiConfig(), experienceId: 'exp-1',
        });

        expect(await ask()).toEqual({ query: QUERY, filters: undefined });
        expect(aiService.chat).not.toHaveBeenCalled();
        expect((await ask()).query).toBe('waterproof jackets');
    });

    it('interprets when both switches are on', async () => {
        const result = await applyQueryInterpretation({
            query: QUERY,
            clientFilters: undefined,
            searchIndexId: freshIndexId(),
            aiConfig: aiConfig(),
            experienceId: 'exp-1',
        });

        expect(aiService.chat).toHaveBeenCalledTimes(1);
        expect(result.query).toBe('waterproof jackets');
        expect(result.filters).toEqual([{ field: 'price', operator: 'lte', value: 200 }]);
    });
});

describe('a model call that fails', () => {
    it('searches with the raw query and logs the error, the only record of it, as an error: a model that fails needs fixing', async () => {
        logs.length = 0;
        // What the Ollama adapter throws for a model it doesn't have
        const modelDown = Object.assign(new Error('model "qwen2.5:14b" not found', { cause: new Error('404 from Ollama') }), { name: 'AdapterError', providerKey: 'ollama', statusCode: 404 });
        vi.mocked(aiService.chat).mockRejectedValue(modelDown);

        const result = await applyQueryInterpretation({
            query: QUERY,
            clientFilters: undefined,
            searchIndexId: freshIndexId(),
            aiConfig: aiConfig(),
            experienceId: 'exp-1',
        });

        expect(result.query).toBe(QUERY);
        expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ err: modelDown }) })]);
    });
});

describe('a model call past the time limit', () => {
    const slowConfig = (): SearchExperienceAIConfig => {
        const config = aiConfig();
        return { ...config, queryUnderstanding: { ...config.queryUnderstanding!, timeoutMs: 500 } };
    };

    it("searches with the raw query and the client's filters within the limit, and stops the model call nobody waits for", async () => {
        let signal: AbortSignal | undefined;
        vi.mocked(aiService.chat).mockImplementation((_messages, options) => {
            signal = options?.signal;
            return new Promise((_resolve, reject) => {
                options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            });
        });
        logs.length = 0;

        const startedAt = Date.now();
        const result = await applyQueryInterpretation({
            query: QUERY,
            clientFilters: [{ field: 'brand', operator: 'eq', value: 'x' }],
            searchIndexId: freshIndexId(),
            aiConfig: slowConfig(),
            experienceId: 'exp-1',
        });

        expect(Date.now() - startedAt).toBeLessThan(1500);
        expect(result.query).toBe(QUERY);
        expect(result.filters).toEqual([{ field: 'brand', operator: 'eq', value: 'x' }]);
        expect(signal?.aborted).toBe(true);
        expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', message: 'Query interpretation timed out; searching with the raw query' })]);
    });

    it('does not keep a call the provider never ends: it is released when its caller leaves and the next search asks again', async () => {
        vi.useFakeTimers();
        try {
            const searchIndexId = freshIndexId();
            vi.mocked(aiService.chat).mockImplementationOnce(() => new Promise(() => {}));
            const ask = () => applyQueryInterpretation({
                query: QUERY, clientFilters: undefined, searchIndexId, aiConfig: slowConfig(), experienceId: 'exp-1',
            });

            const first = ask();
            await vi.advanceTimersByTimeAsync(500);
            expect((await first).query).toBe(QUERY);

            expect((await ask()).query).toBe('waterproof jackets');
            expect(aiService.chat).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('stops the shared call when the joiner, the last one waiting, reaches its limit too', async () => {
        vi.useFakeTimers();
        try {
            const searchIndexId = freshIndexId();
            vi.mocked(aiService.chat).mockImplementationOnce(() => new Promise(() => {}));
            const ask = (timeoutMs: number) => {
                const config = aiConfig();
                return applyQueryInterpretation({
                    query: QUERY, clientFilters: undefined, searchIndexId,
                    aiConfig: { ...config, queryUnderstanding: { ...config.queryUnderstanding!, timeoutMs } },
                    experienceId: 'exp-1',
                });
            };
            const first = ask(500);
            const joiner = ask(2000);

            await vi.advanceTimersByTimeAsync(500);
            expect((await first).query).toBe(QUERY);
            const signal = vi.mocked(aiService.chat).mock.calls[0]?.[1]?.signal;
            expect(signal?.aborted).toBe(false);

            await vi.advanceTimersByTimeAsync(1500);
            expect((await joiner).query).toBe(QUERY);
            expect(signal?.aborted).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it('stops both calls when the index settings change while one runs and every search then leaves', async () => {
        vi.useFakeTimers();
        try {
            const searchIndexId = freshIndexId();
            vi.mocked(aiService.chat).mockImplementation(() => new Promise(() => {}));
            const ask = () => applyQueryInterpretation({
                query: QUERY, clientFilters: undefined, searchIndexId, aiConfig: slowConfig(), experienceId: 'exp-1',
            });

            const first = ask();
            await vi.advanceTimersByTimeAsync(10);
            // The index's settings change: the running call's answer is stale, a new search asks again
            await invalidateQueryInterpreterCache(searchIndexId);
            const second = ask();
            await vi.advanceTimersByTimeAsync(10);
            const signals = vi.mocked(aiService.chat).mock.calls.map(([, options]) => options?.signal);
            expect(signals).toHaveLength(2);
            expect(signals.map((signal) => signal?.aborted)).toEqual([false, false]);

            await vi.advanceTimersByTimeAsync(500);
            expect((await first).query).toBe(QUERY);
            expect((await second).query).toBe(QUERY);
            expect(signals.map((signal) => signal?.aborted)).toEqual([true, true]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('does not start the model call when its caller left while the fields were loading', async () => {
        vi.useFakeTimers();
        try {
            vi.mocked(searchIndexService.getSearchIndexById).mockImplementationOnce(() => new Promise((resolve) => {
                setTimeout(() => resolve({ id: 'idx', fields: INDEX_FIELDS } as never), 1000);
            }));
            const result = applyQueryInterpretation({
                query: QUERY, clientFilters: undefined, searchIndexId: freshIndexId(), aiConfig: slowConfig(), experienceId: 'exp-1',
            });

            await vi.advanceTimersByTimeAsync(500);
            expect((await result).query).toBe(QUERY);
            await vi.advanceTimersByTimeAsync(1000);
            expect(aiService.chat).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('times out only the caller whose limit passed; a joiner with a longer limit gets the answer from the one call', async () => {
        vi.useFakeTimers();
        try {
            const searchIndexId = freshIndexId();
            let answer: () => void = () => {};
            vi.mocked(aiService.chat).mockImplementationOnce(() => new Promise((resolve) => {
                answer = () => resolve({ message: { content: JSON.stringify({ query: 'waterproof jackets', filters: [] }) } } as unknown as Awaited<ReturnType<typeof aiService.chat>>);
            }));
            const ask = (timeoutMs: number) => {
                const config = aiConfig();
                return applyQueryInterpretation({
                    query: QUERY,
                    clientFilters: [{ field: 'brand', operator: 'eq', value: 'x' }],
                    searchIndexId,
                    aiConfig: { ...config, queryUnderstanding: { ...config.queryUnderstanding!, timeoutMs } },
                    experienceId: 'exp-1',
                });
            };
            logs.length = 0;
            const short = ask(500);
            const long = ask(4000);

            await vi.advanceTimersByTimeAsync(500);
            const shortResult = await short;
            expect(shortResult.query).toBe(QUERY);
            expect(shortResult.filters).toEqual([{ field: 'brand', operator: 'eq', value: 'x' }]);

            // The joiner still waits for the call, so it keeps running
            const signal = vi.mocked(aiService.chat).mock.calls[0]?.[1]?.signal;
            expect(signal?.aborted).toBe(false);

            await vi.advanceTimersByTimeAsync(1000);
            answer();
            expect((await long).query).toBe('waterproof jackets');
            expect(aiService.chat).toHaveBeenCalledTimes(1);
            expect(logs.filter((l) => l.message === 'Query interpretation failed; searching with the raw query')).toEqual([]);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('interpretation cache', () => {
    it('reuses the interpretation for an identical query and config', async () => {
        const searchIndexId = freshIndexId();
        const config = aiConfig({ customInstructions: 'Prefer in-stock items.' });

        await applyQueryInterpretation({
            query: QUERY, clientFilters: undefined, searchIndexId, aiConfig: config, experienceId: 'exp-1',
        });
        await applyQueryInterpretation({
            query: QUERY, clientFilters: undefined, searchIndexId, aiConfig: config, experienceId: 'exp-1',
        });

        expect(aiService.chat).toHaveBeenCalledTimes(1);
    });

    it("keeps each visitor's letter case: the same words in other capitals get their own interpretation", async () => {
        const searchIndexId = freshIndexId();
        const config = aiConfig();
        vi.mocked(aiService.chat).mockImplementation(async (messages) => ({
            message: { content: JSON.stringify({ query: messages[1].content, filters: [] }) },
        }) as never);

        const lower = await applyQueryInterpretation({
            query: 'sku ab-12 jackets', clientFilters: undefined, searchIndexId, aiConfig: config, experienceId: 'exp-1',
        });
        const upper = await applyQueryInterpretation({
            query: 'SKU AB-12 jackets', clientFilters: undefined, searchIndexId, aiConfig: config, experienceId: 'exp-1',
        });

        expect(lower.query).toBe('sku ab-12 jackets');
        expect(upper.query).toBe('SKU AB-12 jackets');
        expect(aiService.chat).toHaveBeenCalledTimes(2);
    });

    it('re-interprets after the custom instructions change', async () => {
        const searchIndexId = freshIndexId();

        await applyQueryInterpretation({
            query: QUERY,
            clientFilters: undefined,
            searchIndexId,
            aiConfig: aiConfig({ customInstructions: 'Prefer in-stock items.' }),
            experienceId: 'exp-1',
        });

        modelReplies('jackets');
        const second = await applyQueryInterpretation({
            query: QUERY,
            clientFilters: undefined,
            searchIndexId,
            aiConfig: aiConfig({ customInstructions: 'SKUs map to the sku field.' }),
            experienceId: 'exp-1',
        });

        expect(aiService.chat).toHaveBeenCalledTimes(2);
        expect(second.query).toBe('jackets');
    });

    it('re-interprets when instructions are added to a config that had none', async () => {
        const searchIndexId = freshIndexId();

        await applyQueryInterpretation({
            query: QUERY, clientFilters: undefined, searchIndexId, aiConfig: aiConfig(), experienceId: 'exp-1',
        });
        await applyQueryInterpretation({
            query: QUERY,
            clientFilters: undefined,
            searchIndexId,
            aiConfig: aiConfig({ customInstructions: 'Prefer in-stock items.' }),
            experienceId: 'exp-1',
        });

        expect(aiService.chat).toHaveBeenCalledTimes(2);
    });
});

describe('invalidateQueryInterpreterCache', () => {
    it('forces a fresh interpretation for that index', async () => {
        const searchIndexId = freshIndexId();
        const config = aiConfig();

        await applyQueryInterpretation({
            query: QUERY, clientFilters: undefined, searchIndexId, aiConfig: config, experienceId: 'exp-1',
        });
        expect(aiService.chat).toHaveBeenCalledTimes(1);

        await invalidateQueryInterpreterCache(searchIndexId);

        await applyQueryInterpretation({
            query: QUERY, clientFilters: undefined, searchIndexId, aiConfig: config, experienceId: 'exp-1',
        });
        expect(aiService.chat).toHaveBeenCalledTimes(2);
    });

    it('re-reads the index field configuration rather than the cached constraints', async () => {
        const searchIndexId = freshIndexId();
        const config = aiConfig();

        await applyQueryInterpretation({
            query: QUERY, clientFilters: undefined, searchIndexId, aiConfig: config, experienceId: 'exp-1',
        });
        expect(searchIndexService.getSearchIndexById).toHaveBeenCalledTimes(1);

        await invalidateQueryInterpreterCache(searchIndexId);

        await applyQueryInterpretation({
            query: QUERY, clientFilters: undefined, searchIndexId, aiConfig: config, experienceId: 'exp-1',
        });
        expect(searchIndexService.getSearchIndexById).toHaveBeenCalledTimes(2);
    });

    it('leaves other indexes cached', async () => {
        const kept = freshIndexId();
        const cleared = freshIndexId();
        const config = aiConfig();

        for (const searchIndexId of [kept, cleared]) {
            await applyQueryInterpretation({
                query: QUERY, clientFilters: undefined, searchIndexId, aiConfig: config, experienceId: 'exp-1',
            });
        }
        expect(aiService.chat).toHaveBeenCalledTimes(2);

        await invalidateQueryInterpreterCache(cleared);

        // The untouched index still answers from cache; only the cleared one re-runs.
        await applyQueryInterpretation({
            query: QUERY, clientFilters: undefined, searchIndexId: kept, aiConfig: config, experienceId: 'exp-1',
        });
        expect(aiService.chat).toHaveBeenCalledTimes(2);

        await applyQueryInterpretation({
            query: QUERY, clientFilters: undefined, searchIndexId: cleared, aiConfig: config, experienceId: 'exp-1',
        });
        expect(aiService.chat).toHaveBeenCalledTimes(3);
    });
});

describe('loading a field’s values for the model', () => {
    it('is recorded as query understanding, an AI step, not a visitor search', async () => {
        vi.mocked(searchIndexService.getSearchIndexById).mockResolvedValue(
            { id: 'idx', fields: [...INDEX_FIELDS, { fieldName: 'colour', fieldType: 'keyword', isIndexed: true, isFacetable: true }] } as unknown as Awaited<
                ReturnType<typeof searchIndexService.getSearchIndexById>
            >,
        );
        vi.mocked(searchService.searchById).mockResolvedValue(
            { facets: [{ field: 'colour', buckets: [{ key: 'Red', count: 3 }] }] } as unknown as Awaited<ReturnType<typeof searchService.searchById>>,
        );

        await applyQueryInterpretation({
            query: QUERY, clientFilters: undefined, searchIndexId: freshIndexId(), aiConfig: aiConfig(), experienceId: 'exp-1',
        });

        expect(searchService.searchById).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ query: '*' }),
            { triggerType: 'ai_step', triggerStep: 'query_interpretation' },
        );
    });

    it("logs an engine failure while loading them as an error, with the error, and carries on", async () => {
        vi.mocked(searchIndexService.getSearchIndexById).mockResolvedValue(
            { id: 'idx', fields: [...INDEX_FIELDS, { fieldName: 'colour', fieldType: 'keyword', isIndexed: true, isFacetable: true }] } as unknown as Awaited<
                ReturnType<typeof searchIndexService.getSearchIndexById>
            >,
        );
        // What the search service throws when Elasticsearch can't be reached
        const down = new SearchError('', 'PROVIDER_ERROR', {}, { cause: new esErrors.ConnectionError('', { meta: {} } as never) });
        vi.mocked(searchService.searchById).mockRejectedValue(down);
        logs.length = 0;

        await applyQueryInterpretation({
            query: QUERY, clientFilters: undefined, searchIndexId: freshIndexId(), aiConfig: aiConfig(), experienceId: 'exp-1',
        });

        expect(reported(logs).filter((l) => l.message === 'Failed to fetch facet values')).toEqual([
            expect.objectContaining({ level: 'error', context: expect.objectContaining({ field: 'colour', err: down }) }),
        ]);
    });
});
