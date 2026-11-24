// src/features/search/providers/azure-ai-search/azure-field-mapper.test.ts

/**
 * Azure field mapper — the filterable/facetable split.
 *
 * Azure treats filtering and faceting as independent field capabilities. This
 * mapper used to derive `filterable` from `isFacetable` alone, so a field you
 * filter but never facet — `uniqueId`, `storyId` — could not be filtered at all,
 * and deletes addressed by id silently matched nothing.
 *
 * The compatibility case matters as much as the new one: existing indexes rely on
 * facetable implying filterable, so `locale`, `category` and `keywords` are
 * filterable *because* they are facets. If that ever stops holding, the next
 * reindex strips filtering from live site search.
 */

import { describe, expect, it } from 'vitest';
import { AzureFieldMapper } from './azure-field-mapper';

const mapper = new AzureFieldMapper();

const map = (field: {
    fieldType: string;
    isFacetable?: boolean;
    providerFieldSettings?: Record<string, unknown>;
}) => mapper.mapFieldType(field);

describe('isFilterable', () => {
    it('makes a field filterable without making it facetable', () => {
        const result = map({
            fieldType: 'keyword',
            isFacetable: false,
            providerFieldSettings: { isFilterable: true },
        });

        expect(result).toMatchObject({ filterable: true, facetable: false });
    });

    it('is what unblocks filtering on an identifier field', () => {
        const withoutFlag = map({ fieldType: 'keyword', isFacetable: false });
        const withFlag = map({
            fieldType: 'keyword',
            isFacetable: false,
            providerFieldSettings: { isFilterable: true },
        });

        expect(withoutFlag).toMatchObject({ filterable: false });
        expect(withFlag).toMatchObject({ filterable: true });
    });

    it('only accepts a literal true, not any truthy value', () => {
        const result = map({
            fieldType: 'keyword',
            isFacetable: false,
            providerFieldSettings: { isFilterable: 'yes' },
        });

        expect(result).toMatchObject({ filterable: false });
    });
});

describe('backward compatibility', () => {
    // Guards the live category/keyword filters and locale filtering, all of which
    // predate isFilterable and are filterable purely by virtue of being facets.
    it('keeps facetable implying filterable', () => {
        const result = map({ fieldType: 'keyword', isFacetable: true });

        expect(result).toMatchObject({ filterable: true, facetable: true });
    });

    it('stays filterable when facetable is set and isFilterable is absent', () => {
        const result = map({
            fieldType: 'keyword',
            isFacetable: true,
            providerFieldSettings: { isSortable: true },
        });

        expect(result).toMatchObject({ filterable: true });
    });

    it('ignores an explicit false when the field is facetable', () => {
        // The flag only ever adds capability, never subtracts. Honouring false here
        // would strip filtering from every facet-derived filter — locale, category,
        // keywords — on the next reindex.
        const result = map({
            fieldType: 'keyword',
            isFacetable: true,
            providerFieldSettings: { isFilterable: false },
        });

        expect(result).toMatchObject({ filterable: true, facetable: true });
    });

    it('is not filterable or facetable when neither flag is set', () => {
        const result = map({ fieldType: 'keyword' });

        expect(result).toMatchObject({ filterable: false, facetable: false });
    });
});

describe('EDM type has the final say', () => {
    it('refuses filterable on a type Azure cannot filter, even when asked', () => {
        // `object` maps to Edm.ComplexType, the one EDM type outside
        // FILTERABLE_EDM_TYPES. Azure rejects an index definition that marks a
        // complex field filterable, so the type must override the field config.
        const result = map({
            fieldType: 'object',
            isFacetable: true,
            providerFieldSettings: { isFilterable: true },
        });

        expect(result).toMatchObject({ filterable: false, facetable: false });
    });

    it('returns null for an unknown field type', () => {
        expect(map({ fieldType: 'not-a-real-type' })).toBeNull();
    });

    it('maps a collection type as filterable when asked', () => {
        // keywords is Collection(Edm.String) — in FILTERABLE_EDM_TYPES, and the
        // field the site's keyword filter depends on.
        const result = map({
            fieldType: 'array',
            providerFieldSettings: { isFilterable: true },
        });

        expect(result).toMatchObject({ filterable: true });
    });
});

describe('index language', () => {
    it('sets the language analyzer on a searchable text field', () => {
        expect(mapper.mapFieldType({ fieldType: 'text', isSearchable: true, language: 'danish' })?.analyzer).toBe('da.microsoft');
    });

    it('keeps a field\'s own analyzer over the language one', () => {
        expect(mapper.mapFieldType({ fieldType: 'text', language: 'danish', customAnalyzer: 'keyword' })?.analyzer).toBe('keyword');
    });

    it('sets none on a field that is not searched, a non-text field or an unknown language', () => {
        expect(mapper.mapFieldType({ fieldType: 'text', isSearchable: false, language: 'danish' })).not.toHaveProperty('analyzer');
        expect(mapper.mapFieldType({ fieldType: 'number', language: 'danish' })).not.toHaveProperty('analyzer');
        expect(mapper.mapFieldType({ fieldType: 'text', language: 'klingon' })).not.toHaveProperty('analyzer');
        expect(mapper.mapFieldType({ fieldType: 'text' })).not.toHaveProperty('analyzer');
    });
});

describe('index language and field types', () => {
    it('applies to prose field types only, as on Elasticsearch', () => {
        for (const fieldType of ['text', 'html', 'markdown', 'richtext']) {
            expect(mapper.mapFieldType({ fieldType, isSearchable: true, language: 'danish' })?.analyzer, fieldType).toBe('da.microsoft');
        }
        for (const fieldType of ['keyword', 'url', 'email', 'image_url', 'json', 'array']) {
            const mapped = mapper.mapFieldType({ fieldType, isSearchable: true, language: 'danish' });
            expect(mapped, fieldType).not.toBeNull();
            expect(mapped, fieldType).not.toHaveProperty('analyzer');
        }
    });

    it('still lets a searchable keyword field carry its own analyzer', () => {
        expect(mapper.mapFieldType({ fieldType: 'keyword', isSearchable: true, language: 'danish', customAnalyzer: 'keyword' })?.analyzer).toBe('keyword');
    });
});
