import { describe, it, expect } from 'vitest';

import { buildEmbeddingPreview, getEmbeddingText } from './embedding-text';

import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';

// ============================================================================
// HELPERS
// ============================================================================

/** Build a minimal vector-source field. Only the columns the builder reads matter. */
function field(overrides: {
    fieldName: string;
    displayName?: string | null;
    boostValue?: number;
}): SearchIndexField {
    return {
        fieldName: overrides.fieldName,
        displayName: overrides.displayName ?? null,
        boostValue: overrides.boostValue ?? 1,
    } as unknown as SearchIndexField;
}

// ============================================================================
// LABELLING
// ============================================================================

describe('embedding text — labelling', () => {
    it('prefixes every value with its field label', () => {
        // A bare "camel" reads as the animal; "Colour: camel" does not.
        const text = getEmbeddingText(
            { primaryColor: 'camel' },
            [field({ fieldName: 'primaryColor', displayName: 'Colour' })]
        );

        expect(text).toBe('Colour: camel');
    });

    it('falls back to the field name when there is no display name', () => {
        const text = getEmbeddingText({ season: 'Summer' }, [field({ fieldName: 'season' })]);

        expect(text).toBe('season: Summer');
    });

    it('puts each field on its own line', () => {
        const text = getEmbeddingText(
            { name: 'Denim Jacket', season: 'Summer' },
            [field({ fieldName: 'name' }), field({ fieldName: 'season' })]
        );

        expect(text).toBe('name: Denim Jacket\nseason: Summer');
    });
});

// ============================================================================
// ORDERING
// ============================================================================

describe('embedding text — ordering', () => {
    it('orders by boost, not alphabetically', () => {
        // Alphabetical order buried the product name behind ageGroup and
        // availableColors; earlier tokens carry more weight in the model.
        const preview = buildEmbeddingPreview(
            { ageGroup: 'Adult', availableColors: ['camel'], name: 'Denim Jacket' },
            [
                field({ fieldName: 'ageGroup', boostValue: 3 }),
                field({ fieldName: 'availableColors', boostValue: 3 }),
                field({ fieldName: 'name', boostValue: 9 }),
            ]
        );

        expect(preview.parts.map(p => p.fieldName)).toEqual([
            'name', 'ageGroup', 'availableColors',
        ]);
        expect(preview.text.startsWith('name: Denim Jacket')).toBe(true);
    });

    it('breaks boost ties on field name so output is stable', () => {
        const fields = [
            field({ fieldName: 'season', boostValue: 3 }),
            field({ fieldName: 'brand', boostValue: 3 }),
        ];
        const doc = { season: 'Summer', brand: 'Haven' };

        expect(getEmbeddingText(doc, fields)).toBe(getEmbeddingText(doc, fields));
        expect(getEmbeddingText(doc, fields)).toBe('brand: Haven\nseason: Summer');
    });

    it('does not mutate the caller\'s field array', () => {
        const fields = [
            field({ fieldName: 'a', boostValue: 1 }),
            field({ fieldName: 'z', boostValue: 9 }),
        ];

        getEmbeddingText({ a: 'x', z: 'y' }, fields);

        expect(fields.map(f => f.fieldName)).toEqual(['a', 'z']);
    });
});

// ============================================================================
// VALUE RENDERING
// ============================================================================

describe('embedding text — value rendering', () => {
    it('renders arrays as comma-separated lists', () => {
        const text = getEmbeddingText(
            { tags: ['classic', 'office', 'summer'] },
            [field({ fieldName: 'tags' })]
        );

        expect(text).toBe('tags: classic, office, summer');
    });

    it('includes numbers and booleans, which the label makes meaningful', () => {
        const text = getEmbeddingText(
            { maxPrice: 89.99, inStock: true, hasDiscount: false },
            [
                field({ fieldName: 'maxPrice', displayName: 'Price' }),
                field({ fieldName: 'inStock', displayName: 'In stock' }),
                field({ fieldName: 'hasDiscount', displayName: 'On sale' }),
            ]
        );

        expect(text).toContain('Price: 89.99');
        expect(text).toContain('In stock: yes');
        expect(text).toContain('On sale: no');
    });

    it('trims surrounding whitespace from values', () => {
        const text = getEmbeddingText({ name: '  Denim Jacket  ' }, [field({ fieldName: 'name' })]);

        expect(text).toBe('name: Denim Jacket');
    });
});

// ============================================================================
// EXCLUSIONS
// ============================================================================

describe('embedding text — exclusions', () => {
    it('drops empty arrays instead of emitting a blank part', () => {
        // The old builder pushed '' for these, so documents began with stray
        // separators and the text started with whitespace.
        const preview = buildEmbeddingPreview(
            { availableColors: [], name: 'Denim Jacket' },
            [
                field({ fieldName: 'availableColors', boostValue: 3 }),
                field({ fieldName: 'name', boostValue: 9 }),
            ]
        );

        expect(preview.text).toBe('name: Denim Jacket');
        expect(preview.parts.find(p => p.fieldName === 'availableColors')).toMatchObject({
            included: false,
            excludedBecause: 'empty',
        });
    });

    it('reports arrays of objects as unsupported, not empty', () => {
        // A variants list embeds as SKU and hex-code noise. Calling it "empty"
        // would suggest this document lacks data, when in fact the field can
        // never contribute on any document.
        const preview = buildEmbeddingPreview(
            { variants: [{ sku: 'X-1', colorHex: '#C19A6B' }] },
            [field({ fieldName: 'variants' })]
        );

        expect(preview.text).toBe('');
        expect(preview.parts[0]).toMatchObject({
            included: false,
            excludedBecause: 'unsupported-type',
        });
    });

    it('reports plain objects as unsupported', () => {
        const preview = buildEmbeddingPreview(
            { customFields: { a: 1 } },
            [field({ fieldName: 'customFields' })]
        );

        expect(preview.parts[0]).toMatchObject({
            included: false,
            excludedBecause: 'unsupported-type',
        });
    });

    it('separates missing values from empty and unsupported ones', () => {
        // These are three different problems with three different fixes, so a
        // null field must not be reported as the wrong type.
        const preview = buildEmbeddingPreview(
            { absent: null, undef: undefined, blank: '   ', emptyList: [], obj: { a: 1 } },
            [
                field({ fieldName: 'absent' }),
                field({ fieldName: 'undef' }),
                field({ fieldName: 'blank' }),
                field({ fieldName: 'emptyList' }),
                field({ fieldName: 'obj' }),
            ]
        );

        const reason = (name: string) =>
            preview.parts.find(p => p.fieldName === name)?.excludedBecause;

        expect(preview.text).toBe('');
        expect(reason('absent')).toBe('missing');
        expect(reason('undef')).toBe('missing');
        expect(reason('blank')).toBe('empty');
        expect(reason('emptyList')).toBe('empty');
        expect(reason('obj')).toBe('unsupported-type');
    });

    it('excludes non-finite numbers rather than embedding "NaN"', () => {
        const preview = buildEmbeddingPreview(
            { price: Number.NaN },
            [field({ fieldName: 'price' })]
        );

        expect(preview.text).toBe('');
        expect(preview.parts[0].included).toBe(false);
    });

    it('reports every vector-source field, included or not', () => {
        // The UI lists what contributed nothing — a silently-empty field is
        // exactly what ruins semantic search unnoticed.
        const preview = buildEmbeddingPreview(
            { name: 'Denim Jacket', tags: [] },
            [field({ fieldName: 'name' }), field({ fieldName: 'tags' })]
        );

        expect(preview.parts).toHaveLength(2);
        expect(preview.parts.filter(p => p.included)).toHaveLength(1);
    });
});

// ============================================================================
// PREVIEW PARITY
// ============================================================================

describe('preview parity', () => {
    it('getEmbeddingText returns exactly the preview text', () => {
        // The admin UI shows the preview; if these diverge it shows a lie.
        const fields = [
            field({ fieldName: 'name', boostValue: 9 }),
            field({ fieldName: 'tags', boostValue: 2 }),
            field({ fieldName: 'variants', boostValue: 3 }),
            field({ fieldName: 'maxPrice', boostValue: 1 }),
        ];
        const doc = {
            name: 'Denim Jacket',
            tags: ['classic', 'office'],
            variants: [{ sku: 'X-1' }],
            maxPrice: 89.99,
        };

        const preview = buildEmbeddingPreview(doc, fields);

        expect(getEmbeddingText(doc, fields)).toBe(preview.text);
        expect(preview.totalChars).toBe(preview.text.length);
    });

    it('reports zero characters for a document with nothing embeddable', () => {
        const preview = buildEmbeddingPreview({ tags: [] }, [field({ fieldName: 'tags' })]);

        expect(preview.text).toBe('');
        expect(preview.totalChars).toBe(0);
    });
});
