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

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/features/ai-service', () => ({
    chat: vi.fn(),
}));

vi.mock('@/features/search-index/search-index.service', () => ({
    getSearchIndexById: vi.fn(),
}));

vi.mock('@/features/search/search.service', () => ({
    searchById: vi.fn(),
}));

import * as aiService from '@/features/ai-service';
import * as searchIndexService from '@/features/search-index/search-index.service';
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
