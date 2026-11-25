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

import { AzureKeyCredential, SearchIndexClient } from '@azure/search-documents';

import { buildIndexSettingsContext } from '@/features/search-index/provider-settings.utils';

import { getIndexClient } from './azure-client';
import { AzureEngineProvider } from './azure-engine.provider';

type Field = { name: string; analyzerName?: string; searchable?: boolean };

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
        expect(by('title').analyzerName).toBe('da.microsoft');
        expect(by('body').analyzerName).toBe('da.microsoft');
    });

    it('lets a field keep its own analyzer', () => {
        expect(by('special').analyzerName).toBe('keyword');
    });

    it('gives the key, filter-only, numeric and vector fields no analyzer', () => {
        for (const name of ['id', 'sku', 'price', 'embedding']) {
            expect(by(name), name).not.toHaveProperty('analyzerName');
        }
    });

    it('keeps the autocomplete field in the suggester', () => {
        expect(result.settings?.suggesters).toEqual([expect.objectContaining({ sourceFields: ['title'] })]);
        expect(by('title').analyzerName).toBe('da.microsoft');
    });
});

describe('an Azure index in another language', () => {
    it('uses the Norwegian analyzer for Norwegian', () => {
        expect(build('norwegian').by('body').analyzerName).toBe('nb.microsoft');
    });

    it('uses the standard Lucene analyzer for standard', () => {
        expect(build('standard').by('body').analyzerName).toBe('standard.lucene');
    });

    it('sets no analyzer for a language Azure has none for', () => {
        for (const language of ['cjk', 'serbian', 'klingon', undefined]) {
            const { by } = build(language);
            expect(by('body'), String(language)).not.toHaveProperty('analyzerName');
            expect(by('special').analyzerName).toBe('keyword');
        }
    });
});

describe('a stored Azure index record', () => {
    // The context builder is what reindex, recreate and first-upload create all call
    it('carries its language through the production context builder to the field analyzers', () => {
        const record = { searchProvider: 'azure-ai-search', language: 'danish', synonyms: [], stopWords: [], providerSettings: {}, numberOfShards: 1, numberOfReplicas: 0, refreshInterval: '1s' };
        const fields = [
            { fieldName: 'title', fieldType: 'text', isSearchable: true, isFacetable: false, isAutocomplete: false, customAnalyzer: null, providerFieldSettings: {} },
            { fieldName: 'sku', fieldType: 'keyword', isSearchable: true, isFacetable: false, isAutocomplete: false, customAnalyzer: null, providerFieldSettings: {} },
        ];
        const result = new AzureEngineProvider().buildIndexSettings(buildIndexSettingsContext(record, fields));
        const defs = (result.mappings as { fields: Field[] }).fields;
        expect(defs.find(f => f.name === 'title')?.analyzerName).toBe('da.microsoft');
        expect(defs.find(f => f.name === 'sku')).not.toHaveProperty('analyzerName');
    });
});

describe('the create request sent to Azure', () => {
    // Runs createIndex through the real Azure SDK and reads the request body it would send,
    // so a property the SDK drops (it takes `analyzerName`, not `analyzer`) fails here.
    function realClientCapturing(sent: { body?: Record<string, unknown> }) {
        const headers = { get: () => undefined, has: () => false, set: () => {}, delete: () => {}, toJSON: () => ({}), [Symbol.iterator]: function* () {} };
        return new SearchIndexClient('https://example.search.windows.net', new AzureKeyCredential('test-key'), {
            retryOptions: { maxRetries: 0 },
            httpClient: {
                sendRequest: async (request) => {
                    sent.body = JSON.parse(String(request.body));
                    return { status: 201, headers, request, bodyAsText: JSON.stringify(sent.body) } as never;
                },
            },
        });
    }

    it('carries each field analyzer in the body Azure receives', async () => {
        const sent: { body?: Record<string, unknown> } = {};
        vi.mocked(getIndexClient).mockReturnValue(realClientCapturing(sent));
        const { result } = build('danish');

        const outcome = await new AzureEngineProvider().createIndex('language-check', { mappings: result.mappings, settings: result.settings });

        expect(outcome.success).toBe(true);
        const fields = (sent.body?.fields ?? []) as Array<{ name: string; analyzer?: string | null }>;
        const analyzerOf = (name: string) => fields.find(f => f.name === name)?.analyzer ?? undefined;
        expect(analyzerOf('title')).toBe('da.microsoft');
        expect(analyzerOf('body')).toBe('da.microsoft');
        expect(analyzerOf('special')).toBe('keyword');
        for (const name of ['id', 'sku', 'price', 'embedding']) expect(analyzerOf(name), name).toBeUndefined();
        expect(sent.body?.suggesters).toEqual([expect.objectContaining({ sourceFields: ['title'] })]);
    });
});
