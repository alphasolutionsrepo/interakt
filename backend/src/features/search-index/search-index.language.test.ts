// src/features/search-index/search-index.language.test.ts

/**
 * An index language must be one its engine can analyse text in. Create, update and import
 * each refuse one it can't with a 400, naming the language and the engine; Danish and
 * Norwegian are accepted on both. Changing the language of an Azure index flags a reindex,
 * as it does on Elasticsearch, because Azure now builds its field analyzers from it.
 * Through the real service; storage is stubbed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/logger/logger', () => ({
    createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const state = vi.hoisted(() => ({
    provider: 'elasticsearch',
    existing: {} as Record<string, unknown>,
    created: [] as Record<string, unknown>[],
}));

vi.mock('@/config/search-provider.config', () => ({
    get selectedSearchProvider() { return state.provider; },
}));
vi.mock('@/features/search-experience', () => ({ invalidateSearchExperienceCacheBySearchIndex: vi.fn() }));
vi.mock('@/features/search-experience/query-interpreter.cache', () => ({ invalidateQueryInterpreterCache: vi.fn() }));
vi.mock('./search-index-fields.service', () => ({ importFields: async () => 0 }));
vi.mock('./search-index-fields.repository', () => ({ createFields: async () => [] }));
vi.mock('./search-index.repository', () => ({
    nameExists: async () => false,
    getSearchIndexById: async () => ({ ...state.existing }),
    createSearchIndexOnly: async (data: Record<string, unknown>) => { state.created.push(data); return { id: 'new', displayName: 'New', searchType: 'lexical', ...data }; },
    updateSearchIndexStatus: vi.fn(),
    updateSearchIndex: vi.fn(),
    incrementMappingVersion: vi.fn(),
}));

import { ValidationError } from '@/shared/errors/app-error';

import * as repository from './search-index.repository';
import { createSearchIndex, importSearchIndex, updateSearchIndex } from './search-index.service';

const base = { name: 'shop', displayName: 'Shop', searchType: 'lexical' as const };
const importOf = (language: string) => ({
    importData: {
        version: '1.0',
        searchIndex: { ...base, templateSlug: '', indexingStrategy: 'on_upload', language, synonyms: [], stopWords: [] },
        fields: [],
    },
}) as never;

beforeEach(() => {
    state.provider = 'elasticsearch';
    state.created.length = 0;
    state.existing = { id: 'i1', name: 'shop', searchProvider: 'elasticsearch', language: 'english' };
    vi.mocked(repository.incrementMappingVersion).mockClear();
    vi.mocked(repository.updateSearchIndex).mockClear();
});

const ENGINES = [
    ['elasticsearch', 'Elasticsearch'],
    ['azure-ai-search', 'Azure AI Search'],
] as const;

describe.each(ENGINES)('on %s', (provider, engine) => {
    it('create accepts Danish and Norwegian', async () => {
        for (const language of ['danish', 'norwegian']) {
            await createSearchIndex({ ...base, searchProvider: provider, language }, 'u1');
        }
        expect(state.created.map(c => c.language)).toEqual(['danish', 'norwegian']);
    });

    it('create refuses a language the engine lacks, naming both', async () => {
        const error = await createSearchIndex({ ...base, searchProvider: provider, language: 'klingon' }, 'u1').catch(e => e);
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.status).toBe(400);
        expect(error.message).toBe(`Language 'klingon' isn't available for ${engine}`);
        expect(state.created).toEqual([]);
    });

    it('update accepts Danish and Norwegian', async () => {
        state.existing.searchProvider = provider;
        for (const language of ['danish', 'norwegian']) {
            await updateSearchIndex('i1', { language }, 'u1');
        }
        expect(vi.mocked(repository.updateSearchIndex).mock.calls.map(c => c[1].language)).toEqual(['danish', 'norwegian']);
    });

    it('update refuses a language the engine lacks', async () => {
        state.existing.searchProvider = provider;
        const error = await updateSearchIndex('i1', { language: 'klingon' }, 'u1').catch(e => e);
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.status).toBe(400);
        expect(error.message).toBe(`Language 'klingon' isn't available for ${engine}`);
        expect(repository.updateSearchIndex).not.toHaveBeenCalled();
    });

    it('import accepts Danish and refuses a language the engine lacks', async () => {
        state.provider = provider;
        await importSearchIndex(importOf('danish'), 'u1');
        expect(state.created.at(-1)?.language).toBe('danish');

        const error = await importSearchIndex(importOf('klingon'), 'u1').catch(e => e);
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).toBe(`Language 'klingon' isn't available for ${engine}`);
        expect(state.created).toHaveLength(1);
    });
});

describe('languages only one engine has', () => {
    it('update refuses CJK on Azure and takes it on Elasticsearch', async () => {
        state.existing.searchProvider = 'azure-ai-search';
        await expect(updateSearchIndex('i1', { language: 'cjk' }, 'u1')).rejects.toThrow("Language 'cjk' isn't available for Azure AI Search");
        state.existing.searchProvider = 'elasticsearch';
        await expect(updateSearchIndex('i1', { language: 'cjk' }, 'u1')).resolves.toBeDefined();
    });
});

describe('changing the language', () => {
    it.each(ENGINES)('on %s flags the index for a reindex', async (provider) => {
        state.existing.searchProvider = provider;
        await updateSearchIndex('i1', { language: 'danish' }, 'u1');
        expect(repository.incrementMappingVersion).toHaveBeenCalledWith('i1');
    });

    it.each(ENGINES)('on %s to the same language does not', async (provider) => {
        state.existing.searchProvider = provider;
        await updateSearchIndex('i1', { language: 'english' }, 'u1');
        expect(repository.incrementMappingVersion).not.toHaveBeenCalled();
    });
});

describe('reindex fields per engine', () => {
  it('include language on Azure as well as Elasticsearch', async () => {
    const { getReindexFieldsForProvider } = await import('@/shared/constants/search-index.constants');
    expect(getReindexFieldsForProvider('azure-ai-search')).toEqual(['language', 'synonyms']);
    expect(getReindexFieldsForProvider('elasticsearch')).toContain('language');
  });
});
