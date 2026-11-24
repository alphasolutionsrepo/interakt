// src/features/search/providers/azure-ai-search/azure-engine.provider.index-language.test.ts

/**
 * An Azure index runs on its language. Searchable text fields get the language's analyzer;
 * a field's own analyzer still wins; the key, filter-only and vector fields get none; and a
 * language Azure has no analyzer for sets nothing rather than an invalid name.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/logger/logger', () => ({
    createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('./azure-client', () => ({ getIndexClient: vi.fn(), getSearchClient: vi.fn(), checkAzureHealth: vi.fn() }));

import { AzureEngineProvider } from './azure-engine.provider';

type Field = { name: string; analyzer?: string; searchable?: boolean };

function build(language: string | undefined) {
    const result = new AzureEngineProvider().buildIndexSettings({
        language,
        providerSettings: {},
        embeddingConfig: { fieldName: 'embedding', dimensions: 8, similarity: 'cosine' },
        fields: [
            { fieldName: 'title', fieldType: 'text', isSearchable: true, isAutocomplete: true, providerFieldSettings: {} },
            { fieldName: 'body', fieldType: 'text', isSearchable: true, providerFieldSettings: {} },
            { fieldName: 'special', fieldType: 'text', isSearchable: true, providerFieldSettings: { customAnalyzer: 'keyword' } },
            { fieldName: 'sku', fieldType: 'keyword', isSearchable: false, providerFieldSettings: { isFilterable: true } },
            { fieldName: 'price', fieldType: 'number', isSearchable: false, providerFieldSettings: {} },
        ],
    });
    const fields = (result.mappings as { fields: Field[] }).fields;
    const by = (name: string) => fields.find(f => f.name === name)!;
    return { result, by };
}

describe('an Azure index in Danish', () => {
    const { result, by } = build('danish');

    it('analyses searchable text fields with the Danish analyzer', () => {
        expect(by('title').analyzer).toBe('da.microsoft');
        expect(by('body').analyzer).toBe('da.microsoft');
    });

    it('lets a field keep its own analyzer', () => {
        expect(by('special').analyzer).toBe('keyword');
    });

    it('gives the key, filter-only, numeric and vector fields no analyzer', () => {
        for (const name of ['id', 'sku', 'price', 'embedding']) {
            expect(by(name), name).not.toHaveProperty('analyzer');
        }
    });

    it('keeps the autocomplete field in the suggester', () => {
        expect(result.settings?.suggesters).toEqual([expect.objectContaining({ sourceFields: ['title'] })]);
        expect(by('title').analyzer).toBe('da.microsoft');
    });
});

describe('an Azure index in another language', () => {
    it('uses the Norwegian analyzer for Norwegian', () => {
        expect(build('norwegian').by('body').analyzer).toBe('nb.microsoft');
    });

    it('uses the standard Lucene analyzer for standard', () => {
        expect(build('standard').by('body').analyzer).toBe('standard.lucene');
    });

    it('sets no analyzer for a language Azure has none for', () => {
        for (const language of ['cjk', 'serbian', 'klingon', undefined]) {
            const { by } = build(language);
            expect(by('body'), String(language)).not.toHaveProperty('analyzer');
            expect(by('special').analyzer).toBe('keyword');
        }
    });
});
