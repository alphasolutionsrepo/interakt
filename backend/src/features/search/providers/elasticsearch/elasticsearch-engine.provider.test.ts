// src/features/search/providers/elasticsearch/elasticsearch-engine.provider.test.ts

/**
 * Elasticsearch index settings builder.
 *
 * The regression these tests exist for: the index's `language` and `stopWords`
 * were stored, editable in the UI and documented as working, but never reached
 * Elasticsearch. Every searchable text field was created as bare
 * `{ type: 'text' }`, so ES applied the `standard` analyzer and did no stemming
 * — a search for "jackets" found nothing in an index holding "jacket".
 *
 * The other half of the bug is symmetry: the index-time and search-time
 * analyzers must apply the same stop/stemmer filters, or a stemmed index
 * becomes unreachable from an unstemmed query. Anything below asserting that
 * both chains end in the same filters is guarding that.
 */

import { describe, expect, it } from 'vitest';
import { ElasticsearchEngineProvider } from './elasticsearch-engine.provider';
import type { IndexSettingsBuildContext } from '../search-engine-provider.interface';

const provider = new ElasticsearchEngineProvider();

type Analysis = {
    analyzer: Record<string, { type: string; tokenizer: string; filter: string[] }>;
    filter?: Record<string, Record<string, unknown>>;
    tokenizer?: Record<string, Record<string, unknown>>;
};

/** A text field plus whatever context overrides a test cares about. */
function build(overrides: Partial<IndexSettingsBuildContext> = {}) {
    const result = provider.buildIndexSettings({
        fields: [
            {
                fieldName: 'careInstructions',
                fieldType: 'text',
                isSearchable: true,
                isFacetable: false,
                providerFieldSettings: {},
            },
        ],
        providerSettings: {},
        ...overrides,
    });

    return {
        analysis: (result.settings as { analysis: Analysis }).analysis,
        properties: (result.mappings as { properties: Record<string, Record<string, unknown>> }).properties,
        settings: result.settings as Record<string, unknown>,
    };
}

describe('text analysis', () => {
    it('stems with the index language and attaches both analyzers to text fields', () => {
        const { analysis, properties } = build({ language: 'english' });

        expect(analysis.filter?.interakt_stemmer).toEqual({ type: 'stemmer', language: 'english' });
        expect(properties.careInstructions).toEqual({
            type: 'text',
            analyzer: 'interakt_text',
            search_analyzer: 'interakt_text_search',
        });
    });

    it('uses the language stop word list', () => {
        const { analysis } = build({ language: 'danish' });

        expect(analysis.filter?.interakt_stop).toEqual({ type: 'stop', stopwords: ['_danish_'] });
        expect(analysis.filter?.interakt_stemmer).toEqual({ type: 'stemmer', language: 'danish' });
    });

    it('merges custom stop words on top of the language list', () => {
        const { analysis } = build({ language: 'english', stopWords: ['premium', 'exclusive'] });

        expect(analysis.filter?.interakt_stop).toEqual({
            type: 'stop',
            stopwords: ['_english_', 'premium', 'exclusive'],
        });
    });

    it('defaults to english when no language is given', () => {
        const { analysis } = build();

        expect(analysis.filter?.interakt_stemmer).toEqual({ type: 'stemmer', language: 'english' });
    });

    it('omits the stemmer for languages core ES has none for', () => {
        const { analysis, properties } = build({ language: 'thai' });

        expect(analysis.filter?.interakt_stemmer).toBeUndefined();
        expect(analysis.filter?.interakt_stop).toEqual({ type: 'stop', stopwords: ['_thai_'] });
        // Still a valid, referenceable analyzer pair.
        expect(analysis.analyzer.interakt_text.filter).toEqual(['lowercase', 'interakt_stop']);
        expect(properties.careInstructions.analyzer).toBe('interakt_text');
    });

    it('degrades to lowercase-only for language "standard"', () => {
        const { analysis } = build({ language: 'standard' });

        expect(analysis.filter).toBeUndefined();
        expect(analysis.analyzer.interakt_text.filter).toEqual(['lowercase']);
        expect(analysis.analyzer.interakt_text_search.filter).toEqual(['lowercase']);
    });

    it('falls back to lowercase-only for an unknown language rather than emitting an invalid filter', () => {
        // An invalid stemmer.language or unknown _lang_ reference makes
        // indices.create fail outright, so a legacy value must degrade quietly.
        const { analysis } = build({ language: 'klingon' });

        expect(analysis.filter).toBeUndefined();
        expect(analysis.analyzer.interakt_text.filter).toEqual(['lowercase']);
    });
});

describe('synonyms', () => {
    it('expands synonyms at search time only, over the same stop/stemmer chain', () => {
        const { analysis } = build({
            language: 'english',
            synonyms: ['bags => handbags', 'tv, television'],
        });

        expect(analysis.filter?.interakt_synonyms).toEqual({
            type: 'synonym_graph',
            synonyms: ['bags => handbags', 'tv, television'],
            lenient: true,
        });

        // Synonyms expand before stop/stemming, so rules stay writable in
        // natural form while both sides still end up stemmed.
        expect(analysis.analyzer.interakt_text.filter).toEqual([
            'lowercase', 'interakt_stop', 'interakt_stemmer',
        ]);
        expect(analysis.analyzer.interakt_text_search.filter).toEqual([
            'lowercase', 'interakt_synonyms', 'interakt_stop', 'interakt_stemmer',
        ]);
    });

    it('keeps the two chains symmetric apart from the synonym filter', () => {
        for (const synonyms of [[], ['tv, television']]) {
            const { analysis } = build({ language: 'german', synonyms });
            const indexChain = analysis.analyzer.interakt_text.filter;
            const searchChain = analysis.analyzer.interakt_text_search.filter;

            expect(searchChain.filter(f => f !== 'interakt_synonyms')).toEqual(indexChain);
        }
    });

    it('ignores blank synonym rules', () => {
        const { analysis } = build({ language: 'english', synonyms: ['  ', ''] });

        expect(analysis.filter?.interakt_synonyms).toBeUndefined();
        expect(analysis.analyzer.interakt_text_search.filter).not.toContain('interakt_synonyms');
    });
});

describe('per-field analyzer precedence', () => {
    it('leaves autocomplete fields on the edge-ngram pair and keeps its tokenizer', () => {
        const result = provider.buildIndexSettings({
            fields: [
                {
                    fieldName: 'title',
                    fieldType: 'text',
                    isSearchable: true,
                    providerFieldSettings: { isAutocomplete: true },
                },
            ],
            providerSettings: {},
            language: 'english',
        });

        const analysis = (result.settings as { analysis: Analysis }).analysis;
        const properties = (result.mappings as { properties: Record<string, Record<string, unknown>> }).properties;

        expect(properties.title).toEqual({
            type: 'text',
            analyzer: 'autocomplete',
            search_analyzer: 'autocomplete_search',
        });
        // The language pair is still defined alongside, and merging it must not
        // drop the edge-ngram tokenizer the autocomplete analyzer depends on.
        expect(analysis.analyzer.autocomplete).toBeDefined();
        expect(analysis.analyzer.interakt_text).toBeDefined();
        expect(analysis.tokenizer?.autocomplete_tokenizer).toMatchObject({ type: 'edge_ngram' });
    });

    it('lets an explicit customAnalyzer override the language pair', () => {
        const result = provider.buildIndexSettings({
            fields: [
                {
                    fieldName: 'sku',
                    fieldType: 'text',
                    isSearchable: true,
                    providerFieldSettings: { customAnalyzer: 'keyword' },
                },
            ],
            providerSettings: {},
            language: 'english',
        });

        const properties = (result.mappings as { properties: Record<string, Record<string, unknown>> }).properties;

        expect(properties.sku).toEqual({ type: 'text', analyzer: 'keyword' });
    });

    it('leaves keyword fields unanalyzed and keeps the facet subfield on text', () => {
        const result = provider.buildIndexSettings({
            fields: [
                { fieldName: 'brand', fieldType: 'keyword', isFacetable: true, providerFieldSettings: {} },
                { fieldName: 'category', fieldType: 'text', isSearchable: true, isFacetable: true, providerFieldSettings: {} },
            ],
            providerSettings: {},
            language: 'english',
        });

        const properties = (result.mappings as { properties: Record<string, Record<string, unknown>> }).properties;

        expect(properties.brand).toEqual({ type: 'keyword' });
        expect(properties.category).toEqual({
            type: 'text',
            analyzer: 'interakt_text',
            search_analyzer: 'interakt_text_search',
            fields: { keyword: { type: 'keyword', ignore_above: 256 } },
        });
    });
});

describe('provider settings passthrough', () => {
    it('still maps shards, replicas and refresh interval alongside the analysis block', () => {
        const { settings, analysis } = build({
            language: 'english',
            providerSettings: { numberOfShards: 3, numberOfReplicas: 2, refreshInterval: '30s' },
        });

        expect(settings.number_of_shards).toBe(3);
        expect(settings.number_of_replicas).toBe(2);
        expect(settings.refresh_interval).toBe('30s');
        expect(analysis.analyzer.interakt_text).toBeDefined();
    });
});
