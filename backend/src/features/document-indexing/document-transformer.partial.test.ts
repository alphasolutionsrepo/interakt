import { describe, it, expect } from 'vitest';
import { transformDocument } from './document-transformer.service';
import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';
import type { FieldMappingConfig } from '@/shared/constants/search-index.constants';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build a minimal SearchIndexField. Only the columns the transformer reads are
 * meaningful; the rest are filled with schema defaults.
 */
function field(overrides: {
    fieldName: string;
    fieldType?: string;
    sourceFieldName?: string | null;
    sourceFieldPath?: string | null;
    isRequired?: boolean;
    transformConfig?: FieldMappingConfig | null;
}): SearchIndexField {
    return {
        id: 1,
        searchIndexId: '550e8400-e29b-41d4-a716-446655440000',
        fieldName: overrides.fieldName,
        fieldType: overrides.fieldType ?? 'keyword',
        displayName: null,
        originalTemplateFieldId: null,
        isSystemField: false,
        isRequired: overrides.isRequired ?? false,
        isSearchable: true,
        isFacetable: false,
        includeInResponse: true,
        boostValue: 1,
        sourceFieldName: overrides.sourceFieldName ?? null,
        sourceFieldPath: overrides.sourceFieldPath ?? null,
        transformConfig: overrides.transformConfig ?? null,
        // Remaining columns are irrelevant to transformDocument
    } as unknown as SearchIndexField;
}

/**
 * A representative product index: a source-mapped key, two plain source fields,
 * and the createdAt / updatedAt system fields.
 */
function productFields(): SearchIndexField[] {
    return [
        // uniqueId: mode 'default' with a uuid generator fallback — the field that
        // makes partial mode necessary
        field({
            fieldName: 'uniqueId',
            sourceFieldName: 'sku',
            transformConfig: { mode: 'default', generator: 'uuid', transform: 'none' },
        }),
        field({
            fieldName: 'name',
            fieldType: 'text',
            sourceFieldName: 'name',
            isRequired: true,
            transformConfig: { mode: 'source', transform: 'none' },
        }),
        field({
            fieldName: 'price',
            fieldType: 'number',
            sourceFieldName: 'price',
            transformConfig: { mode: 'source', transform: 'none' },
        }),
        field({
            fieldName: 'language',
            transformConfig: { mode: 'static', staticValue: 'en', transform: 'none' },
        }),
        field({
            fieldName: 'createdAt',
            fieldType: 'date',
            transformConfig: { mode: 'generated', generator: 'timestamp', transform: 'none' },
        }),
        field({
            fieldName: 'updatedAt',
            fieldType: 'date',
            transformConfig: { mode: 'generated', generator: 'timestamp', transform: 'none' },
        }),
    ];
}

// ============================================================================
// PARTIAL MODE
// ============================================================================

describe('transformDocument — partial mode', () => {
    it('includes only payload-carried fields plus updatedAt', () => {
        const result = transformDocument({ price: 42 }, productFields(), { partial: true });

        expect(result.success).toBe(true);
        expect(Object.keys(result.document).sort()).toEqual(['price', 'updatedAt']);
        expect(result.document.price).toBe(42);
    });

    it('does not regenerate createdAt', () => {
        // A merge must not reset the document's creation time
        const result = transformDocument({ price: 42 }, productFields(), { partial: true });

        expect(result.document.createdAt).toBeUndefined();
    });

    it('does not mint a uniqueId when the payload omits the key', () => {
        // Without this, a PATCH would generate a fresh uuid and detach the update
        // from the document it was meant to change
        const result = transformDocument({ price: 42 }, productFields(), { partial: true });

        expect(result.document.uniqueId).toBeUndefined();
    });

    it('carries uniqueId through when the payload supplies the key', () => {
        const result = transformDocument(
            { sku: 'SKU-1', price: 42 },
            productFields(),
            { partial: true }
        );

        expect(result.document.uniqueId).toBe('SKU-1');
        expect(result.document.price).toBe(42);
    });

    it('omits static fields the payload does not carry', () => {
        const result = transformDocument({ price: 42 }, productFields(), { partial: true });

        expect(result.document.language).toBeUndefined();
    });

    it('always refreshes updatedAt', () => {
        const result = transformDocument({ price: 42 }, productFields(), { partial: true });

        expect(typeof result.document.updatedAt).toBe('string');
        expect(Number.isNaN(Date.parse(result.document.updatedAt as string))).toBe(false);
    });

    it('does not fail on a required field the payload omits', () => {
        // `name` is required, but the stored document already has it
        const result = transformDocument({ price: 42 }, productFields(), { partial: true });

        expect(result.success).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('still applies value transforms', () => {
        const fields = [
            field({
                fieldName: 'brand',
                sourceFieldName: 'brand',
                transformConfig: { mode: 'source', transform: 'trim_lowercase' },
            }),
        ];

        const result = transformDocument({ brand: '  ACME  ' }, fields, { partial: true });

        expect(result.document.brand).toBe('acme');
    });

    it('omits a source field with no source mapping instead of erroring', () => {
        const fields = [
            field({
                fieldName: 'orphan',
                transformConfig: { mode: 'source', transform: 'none' },
            }),
        ];

        const result = transformDocument({ price: 42 }, fields, { partial: true });

        expect(result.success).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.document.orphan).toBeUndefined();
    });

    it('produces an empty-but-for-updatedAt document when nothing matches', () => {
        const result = transformDocument({ unrelated: 1 }, productFields(), { partial: true });

        expect(Object.keys(result.document)).toEqual(['updatedAt']);
    });
});

// ============================================================================
// FULL MODE REGRESSION
// ============================================================================

describe('transformDocument — full mode is unchanged', () => {
    it('materializes every mapped field for a complete payload', () => {
        const result = transformDocument(
            { sku: 'SKU-1', name: 'Widget', price: 42 },
            productFields()
        );

        expect(result.success).toBe(true);
        expect(Object.keys(result.document).sort()).toEqual([
            'createdAt',
            'language',
            'name',
            'price',
            'uniqueId',
            'updatedAt',
        ]);
        expect(result.document.uniqueId).toBe('SKU-1');
        expect(result.document.language).toBe('en');
    });

    it('generates a uniqueId when the source omits the key', () => {
        const result = transformDocument({ name: 'Widget' }, productFields());

        expect(typeof result.document.uniqueId).toBe('string');
        expect((result.document.uniqueId as string).length).toBeGreaterThan(0);
    });

    it('still fails when a required field has no value', () => {
        const result = transformDocument({ sku: 'SKU-1', price: 42 }, productFields());

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.field === 'name')).toBe(true);
    });
});
