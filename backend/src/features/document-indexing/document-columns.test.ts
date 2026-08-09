import { describe, it, expect } from 'vitest';

import {
    isFieldSelectionError,
    resolveDisplayColumns,
    sameColumns,
    scoreColumnCandidate,
    toProviderFields,
    MAX_ATTRIBUTE_COLUMNS,
} from './document-columns';

import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';
import type { FieldMappingConfig } from '@/shared/constants/search-index.constants';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build a minimal field. Only the columns the selection reads are meaningful;
 * the rest is cast away rather than filled with noise.
 *
 * Defaults describe an ordinary retrievable field, because the interesting cases
 * are the ones that deviate.
 */
function field(overrides: {
    fieldName: string;
    fieldType?: string;
    displayName?: string | null;
    isSystemField?: boolean;
    isSearchable?: boolean;
    isFacetable?: boolean;
    isIndexed?: boolean;
    includeInResponse?: boolean;
    isMapped?: boolean;
    isVectorSource?: boolean;
    transformConfig?: FieldMappingConfig | null;
}): SearchIndexField {
    return {
        fieldName: overrides.fieldName,
        fieldType: overrides.fieldType ?? 'keyword',
        displayName: overrides.displayName ?? null,
        isSystemField: overrides.isSystemField ?? false,
        isSearchable: overrides.isSearchable ?? false,
        isFacetable: overrides.isFacetable ?? false,
        isIndexed: overrides.isIndexed ?? true,
        includeInResponse: overrides.includeInResponse ?? true,
        isMapped: overrides.isMapped ?? true,
        isVectorSource: overrides.isVectorSource ?? false,
        transformConfig: overrides.transformConfig ?? null,
    } as unknown as SearchIndexField;
}

/** The uniqueId system field every index gets at creation. */
function keyField(displayName: string | null = 'Unique ID'): SearchIndexField {
    return field({
        fieldName: 'uniqueId',
        fieldType: 'keyword',
        displayName,
        isSystemField: true,
        isIndexed: true,
        transformConfig: { mode: 'default', transform: 'none', generator: 'uuid' } as FieldMappingConfig,
    });
}

/**
 * A timestamp system field (createdAt / updatedAt).
 *
 * `mode` is a parameter because real indexes disagree: some carry the generated
 * mode, others carry mode 'source' with a timestamp generator. Both have to end
 * up as the pinned last column.
 */
function timestampField(
    fieldName: 'createdAt' | 'updatedAt',
    mode: 'generated' | 'source' = 'generated'
): SearchIndexField {
    return field({
        fieldName,
        fieldType: 'datetime',
        displayName: fieldName === 'updatedAt' ? 'Updated' : 'Created',
        isSystemField: true,
        isFacetable: true,
        isMapped: mode === 'source',
        transformConfig: { mode, generator: 'timestamp', transform: 'none' } as FieldMappingConfig,
    });
}

const names = (columns: { field: string }[]) => columns.map(c => c.field);

// ============================================================================
// KEY COLUMN
// ============================================================================

describe('resolveDisplayColumns — key column', () => {
    it('always puts the document key first', () => {
        const columns = resolveDisplayColumns([
            field({ fieldName: 'status' }),
            keyField(),
            field({ fieldName: 'title', fieldType: 'text', isSearchable: true }),
        ]);

        expect(columns[0]).toEqual({ field: 'uniqueId', label: 'Unique ID', type: 'id' });
    });

    it('synthesises a key column when the index has no uniqueId field', () => {
        // The provider returns a document key regardless of whether the index
        // maps one, and without it a row has nothing to act on.
        const columns = resolveDisplayColumns([field({ fieldName: 'status' })]);

        expect(columns[0]).toEqual({ field: 'uniqueId', label: 'ID', type: 'id' });
    });

    it('falls back to "ID" when the key field has no display name', () => {
        const columns = resolveDisplayColumns([keyField(null)]);

        expect(columns[0].label).toBe('ID');
    });

    it('never repeats the key as an attribute column', () => {
        const columns = resolveDisplayColumns([keyField(), field({ fieldName: 'status' })]);

        expect(names(columns).filter(name => name === 'uniqueId')).toHaveLength(1);
    });
});

// ============================================================================
// TITLE COLUMN
// ============================================================================

describe('resolveDisplayColumns — title column', () => {
    it('pins a title field directly after the key', () => {
        const columns = resolveDisplayColumns([
            keyField(),
            field({ fieldName: 'status', isFacetable: true }),
            field({ fieldName: 'price', fieldType: 'number' }),
            field({ fieldName: 'title', fieldType: 'text', displayName: 'Title', isSearchable: true }),
        ]);

        expect(names(columns)[1]).toBe('title');
    });

    it('recognises name and product_name as titles', () => {
        for (const titleName of ['name', 'product_name']) {
            const columns = resolveDisplayColumns([
                keyField(),
                field({ fieldName: 'status', isFacetable: true }),
                field({ fieldName: titleName, fieldType: 'text' }),
            ]);

            expect(names(columns)[1]).toBe(titleName);
        }
    });

    it('falls back to a searchable text field when no title-ish name exists', () => {
        const columns = resolveDisplayColumns([
            keyField(),
            field({ fieldName: 'sku', fieldType: 'keyword', isFacetable: true }),
            field({ fieldName: 'heading', fieldType: 'text', isSearchable: true }),
        ]);

        expect(names(columns)[1]).toBe('heading');
    });

    it('omits the title slot entirely when nothing qualifies', () => {
        const columns = resolveDisplayColumns([
            keyField(),
            field({ fieldName: 'price', fieldType: 'number' }),
            field({ fieldName: 'inStock', fieldType: 'boolean' }),
        ]);

        expect(names(columns)).toEqual(['uniqueId', 'price', 'inStock']);
    });
});

// ============================================================================
// RANKING
// ============================================================================

describe('resolveDisplayColumns — attribute ranking', () => {
    it('never shows vector-source fields', () => {
        // These hold the long prose that was embedded.
        const columns = resolveDisplayColumns([
            keyField(),
            field({ fieldName: 'body', fieldType: 'text', isVectorSource: true, isSearchable: true }),
            field({ fieldName: 'status', isFacetable: true }),
        ]);

        expect(names(columns)).not.toContain('body');
    });

    it('never shows the embedding vector', () => {
        const columns = resolveDisplayColumns([
            keyField(),
            field({ fieldName: 'content_embedding', fieldType: 'json' }),
            field({ fieldName: 'status', isFacetable: true }),
        ]);

        expect(names(columns)).not.toContain('content_embedding');
    });

    it('prefers cell-sized types over structures', () => {
        const columns = resolveDisplayColumns([
            keyField(),
            field({ fieldName: 'metadata', fieldType: 'json' }),
            field({ fieldName: 'tags', fieldType: 'array' }),
            field({ fieldName: 'inStock', fieldType: 'boolean' }),
            field({ fieldName: 'status', fieldType: 'keyword' }),
        ]);

        // keyword (30) and boolean (25) beat array (-20) and json (-40).
        expect(names(columns).slice(1, 3)).toEqual(['status', 'inStock']);
        expect(names(columns)).not.toContain('metadata');
    });

    it('breaks a type tie on facetability', () => {
        const columns = resolveDisplayColumns([
            keyField(),
            field({ fieldName: 'vendorRef', fieldType: 'keyword', isFacetable: false }),
            field({ fieldName: 'status', fieldType: 'keyword', isFacetable: true }),
        ]);

        expect(names(columns)[1]).toBe('status');
    });

    it('deprioritises catch-all system blobs', () => {
        const columns = resolveDisplayColumns([
            keyField(),
            field({
                fieldName: 'customFields',
                fieldType: 'json',
                isSystemField: true,
                transformConfig: { mode: 'source', transform: 'none' } as FieldMappingConfig,
            }),
            field({ fieldName: 'status', isFacetable: true }),
        ]);

        expect(names(columns)[1]).toBe('status');
    });

    it('caps attribute columns regardless of index width', () => {
        const wide = [
            keyField(),
            field({ fieldName: 'title', fieldType: 'text', isSearchable: true }),
            ...Array.from({ length: 40 }, (_, i) =>
                field({ fieldName: `attr${i}`, fieldType: 'keyword', isFacetable: true })
            ),
        ];

        const columns = resolveDisplayColumns(wide, { includeTimestamps: true });

        // key + title + attributes (no timestamps defined on this index)
        expect(columns).toHaveLength(2 + MAX_ATTRIBUTE_COLUMNS);
    });

    it('is stable across repeated calls', () => {
        const fields = [
            keyField(),
            field({ fieldName: 'title', fieldType: 'text', isSearchable: true }),
            field({ fieldName: 'brand', fieldType: 'keyword', isFacetable: true }),
            field({ fieldName: 'colour', fieldType: 'keyword', isFacetable: true }),
            field({ fieldName: 'size', fieldType: 'keyword', isFacetable: true }),
            field({ fieldName: 'weight', fieldType: 'keyword', isFacetable: true }),
        ];

        // Equal scores must resolve by field order, not by sort instability.
        expect(names(resolveDisplayColumns(fields)))
            .toEqual(names(resolveDisplayColumns(fields)));
        expect(names(resolveDisplayColumns(fields)))
            .toEqual(['uniqueId', 'title', 'brand', 'colour', 'size']);
    });

    it('excludes fields that are not retrievable', () => {
        const columns = resolveDisplayColumns([
            keyField(),
            field({ fieldName: 'internalNote', includeInResponse: false }),
            field({ fieldName: 'unindexed', isIndexed: false }),
            field({ fieldName: 'unmapped', isMapped: false }),
            field({ fieldName: 'status', isFacetable: true }),
        ]);

        expect(names(columns)).toEqual(['uniqueId', 'status']);
    });
});

// ============================================================================
// TIMESTAMPS
// ============================================================================

describe('resolveDisplayColumns — timestamps', () => {
    const withTimestamps = [
        keyField(),
        field({ fieldName: 'title', fieldType: 'text', isSearchable: true }),
        field({ fieldName: 'status', isFacetable: true }),
        timestampField('createdAt'),
        timestampField('updatedAt'),
    ];

    it('pins updatedAt as the last column', () => {
        const columns = resolveDisplayColumns(withTimestamps, { includeTimestamps: true });

        expect(columns.at(-1)).toEqual({
            field: 'updatedAt',
            label: 'Updated',
            type: 'datetime',
        });
    });

    it('prefers updatedAt over createdAt, showing only one', () => {
        const columns = resolveDisplayColumns(withTimestamps, { includeTimestamps: true });

        expect(names(columns)).not.toContain('createdAt');
    });

    it('falls back to createdAt when updatedAt is absent', () => {
        const columns = resolveDisplayColumns(
            [keyField(), field({ fieldName: 'status' }), timestampField('createdAt')],
            { includeTimestamps: true }
        );

        expect(columns.at(-1)?.field).toBe('createdAt');
    });

    it('omits generated-mode timestamps by default', () => {
        // The default is the safe one: a field row in Postgres is no proof the
        // provider mapping has the field.
        const columns = resolveDisplayColumns(withTimestamps);

        expect(names(columns)).not.toContain('updatedAt');
        expect(names(columns)).not.toContain('createdAt');
    });

    it('pins source-mode timestamps last too', () => {
        // Real indexes configure these as mode 'source' with a timestamp
        // generator as often as mode 'generated'. Detection is by field name for
        // exactly this reason — a source-mode updatedAt is already retrievable,
        // so it must not end up competing for an attribute slot.
        const sourceMode = [
            keyField(),
            field({ fieldName: 'title', fieldType: 'text', isSearchable: true }),
            field({ fieldName: 'category', isFacetable: true }),
            field({ fieldName: 'brand', isFacetable: true }),
            field({ fieldName: 'season', isFacetable: true }),
            field({ fieldName: 'style', isFacetable: true }),
            timestampField('createdAt', 'source'),
            timestampField('updatedAt', 'source'),
        ];

        // Not passed includeTimestamps: source mode is retrievable on its own.
        const columns = resolveDisplayColumns(sourceMode);

        expect(columns.at(-1)?.field).toBe('updatedAt');
        expect(names(columns)).toEqual([
            'uniqueId', 'title', 'category', 'brand', 'season', 'updatedAt',
        ]);
    });

    it('never spends an attribute slot on a timestamp', () => {
        const columns = resolveDisplayColumns(withTimestamps, { includeTimestamps: true });

        expect(names(columns)).toEqual(['uniqueId', 'title', 'status', 'updatedAt']);
    });
});

// ============================================================================
// SCORING + PROVIDER FIELDS
// ============================================================================

describe('scoreColumnCandidate', () => {
    it('scores a faceted keyword above analyzed prose', () => {
        const keyword = scoreColumnCandidate(field({ fieldName: 'status', isFacetable: true }));
        const prose = scoreColumnCandidate(field({ fieldName: 'summary', fieldType: 'text' }));

        expect(keyword).toBeGreaterThan(prose);
    });

    it('scores structures below everything else', () => {
        const json = scoreColumnCandidate(field({ fieldName: 'meta', fieldType: 'json' }));
        const array = scoreColumnCandidate(field({ fieldName: 'tags', fieldType: 'array' }));

        expect(json).toBeLessThan(array);
        expect(array).toBeLessThan(
            scoreColumnCandidate(field({ fieldName: 'label', fieldType: 'text' }))
        );
    });

    it('rewards recognised roles', () => {
        const priced = scoreColumnCandidate(field({ fieldName: 'price', fieldType: 'number' }));
        const plain = scoreColumnCandidate(field({ fieldName: 'weight', fieldType: 'number' }));

        expect(priced).toBeGreaterThan(plain);
    });
});

describe('toProviderFields', () => {
    it('drops a synthetic key column the index does not define', () => {
        // Azure's `select` throws on an unknown field, so the provider list has to
        // be narrower than the column list.
        const fields = [field({ fieldName: 'status' })];
        const columns = resolveDisplayColumns(fields);

        expect(toProviderFields(columns, fields)).toEqual(['status']);
    });

    it('keeps the key when the index defines it', () => {
        const fields = [keyField(), field({ fieldName: 'status' })];
        const columns = resolveDisplayColumns(fields);

        expect(toProviderFields(columns, fields)).toContain('uniqueId');
    });
});

// ============================================================================
// RETRY GUARDS
// ============================================================================

describe('sameColumns', () => {
    it('is true when dropping timestamps changes nothing', () => {
        // The identical-retry case: an index with no createdAt/updatedAt produces
        // the same selection either way, so retrying would repeat a failed call.
        const fields = [keyField(), field({ fieldName: 'status', isFacetable: true })];

        expect(sameColumns(
            resolveDisplayColumns(fields, { includeTimestamps: true }),
            resolveDisplayColumns(fields, { includeTimestamps: false }),
        )).toBe(true);
    });

    it('is false when a timestamp column is actually present', () => {
        const fields = [
            keyField(),
            field({ fieldName: 'status', isFacetable: true }),
            timestampField('updatedAt'),
        ];

        expect(sameColumns(
            resolveDisplayColumns(fields, { includeTimestamps: true }),
            resolveDisplayColumns(fields, { includeTimestamps: false }),
        )).toBe(false);
    });

    it('compares field order, not just membership', () => {
        const a = [{ field: 'x', label: 'X', type: 'keyword' as const }];
        const b = [{ field: 'y', label: 'Y', type: 'keyword' as const }];

        expect(sameColumns(a, a)).toBe(true);
        expect(sameColumns(a, b)).toBe(false);
    });
});

describe('isFieldSelectionError', () => {
    it('recognises a rejected field selection', () => {
        expect(isFieldSelectionError('Unknown field \'updatedAt\' in $select')).toBe(true);
        expect(isFieldSelectionError('no field named updatedAt')).toBe(true);
        expect(isFieldSelectionError("Could not find field 'createdAt'")).toBe(true);
        expect(isFieldSelectionError('Field cannot be selected')).toBe(true);
    });

    it('does NOT match unrelated failures', () => {
        // The regression this guards: retrying on any failure replaced the real
        // error with the retry's, so the actual cause never reached the caller.
        expect(isFieldSelectionError('Unauthorized')).toBe(false);
        expect(isFieldSelectionError('connect ECONNREFUSED 127.0.0.1:9200')).toBe(false);
        expect(isFieldSelectionError('index_not_found_exception')).toBe(false);
        expect(isFieldSelectionError('Request timed out')).toBe(false);
    });

    it('treats a missing message as not retryable', () => {
        expect(isFieldSelectionError(undefined)).toBe(false);
        expect(isFieldSelectionError('')).toBe(false);
    });
});
