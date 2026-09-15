// src/features/search-index/search-index-fields.service.test.ts

/**
 * Field creation defaults.
 *
 * The regression guarded here: single-field creation defaulted isSearchable to
 * true for every type, so a numeric field arrived marked searchable and produced
 * queries Azure rejects outright — "Field 'priceAmount' is not marked as
 * 'searchable'" — which fails every search on the index, not just the highlight.
 * Bulk creation always defaulted by type; these assert the two agree, and that
 * createField actually applies the default rather than just exporting it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// The service reaches the DB through both repositories. Mock them so these stay
// pure unit tests of the attribute defaults createField persists.
vi.mock('./search-index-fields.repository', () => ({
    createField: vi.fn(),
    fieldNameExists: vi.fn(),
    getFieldById: vi.fn(),
    sourceFieldExists: vi.fn(),
    updateField: vi.fn(),
}));

vi.mock('./search-index.repository', () => ({
    getSearchIndexById: vi.fn(),
    incrementMappingVersion: vi.fn(),
}));

// Spied rather than stubbed out: the point of the invalidation test below is that
// a mutation reaches this, which is what drops the index and query-interpreter caches.
vi.mock('./search-index.cache', () => ({
    clearIndexCache: vi.fn(),
}));

import * as repository from './search-index-fields.repository';
import * as searchIndexRepository from './search-index.repository';
import { clearIndexCache } from './search-index.cache';
import { createField, updateField, defaultIsSearchableForType } from './search-index-fields.service';

const INDEX_ID = 'idx-1';

/** The isSearchable value createField handed the repository. */
async function persistedIsSearchable(
    input: { fieldName: string; fieldType: string; isSearchable?: boolean },
): Promise<boolean> {
    await createField(INDEX_ID, input, 'user-1');

    const created = vi.mocked(repository.createField).mock.calls.at(-1)?.[0];
    return created!.isSearchable as boolean;
}

beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(searchIndexRepository.getSearchIndexById).mockResolvedValue(
        { id: INDEX_ID } as Awaited<ReturnType<typeof searchIndexRepository.getSearchIndexById>>,
    );
    // Returns the updated row: markSchemaChanged reads its id and name to clear
    // the index caches without a second query.
    vi.mocked(searchIndexRepository.incrementMappingVersion).mockResolvedValue(
        { id: INDEX_ID, name: 'test-index' } as Awaited<
            ReturnType<typeof searchIndexRepository.incrementMappingVersion>
        >,
    );
    vi.mocked(repository.fieldNameExists).mockResolvedValue(false);
    vi.mocked(repository.createField).mockImplementation(
        async (field) => ({
            id: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...field,
        }) as unknown as Awaited<ReturnType<typeof repository.createField>>,
    );
});

describe('createField', () => {
    it('does not mark a numeric field searchable when the caller omits the flag', async () => {
        expect(await persistedIsSearchable({ fieldName: 'priceAmount', fieldType: 'number' }))
            .toBe(false);
    });

    it('marks a text field searchable when the caller omits the flag', async () => {
        expect(await persistedIsSearchable({ fieldName: 'title', fieldType: 'text' }))
            .toBe(true);
    });

    it('still honours an explicit true on a numeric field', async () => {
        // The API contract is unchanged — the UI is what stops producing this payload.
        expect(await persistedIsSearchable({
            fieldName: 'priceAmount',
            fieldType: 'number',
            isSearchable: true,
        })).toBe(true);
    });

    it('honours an explicit false on a text field', async () => {
        expect(await persistedIsSearchable({
            fieldName: 'title',
            fieldType: 'text',
            isSearchable: false,
        })).toBe(false);
    });
});

describe('schema-change invalidation', () => {
    // These mutations used to only bump the mapping version. The cached index
    // definition — and the query interpreter's field constraints and the
    // interpretations built from them — then served the old schema until their
    // TTLs expired, so a field the admin had just edited stayed stale for minutes.
    it('clears the index caches when a field is created', async () => {
        await createField(INDEX_ID, { fieldName: 'sku', fieldType: 'keyword' }, 'user-1');

        expect(clearIndexCache).toHaveBeenCalledWith(INDEX_ID, 'test-index');
    });

    it('clears the index caches when a field attribute is updated', async () => {
        vi.mocked(repository.getFieldById).mockResolvedValue(
            { id: 1, searchIndexId: INDEX_ID, fieldName: 'sku', fieldType: 'keyword' } as Awaited<
                ReturnType<typeof repository.getFieldById>
            >,
        );
        vi.mocked(repository.updateField).mockResolvedValue(
            { id: 1, searchIndexId: INDEX_ID } as Awaited<ReturnType<typeof repository.updateField>>,
        );

        await updateField(1, { isFacetable: true }, 'user-1');

        expect(clearIndexCache).toHaveBeenCalledWith(INDEX_ID, 'test-index');
    });
});

describe('defaultIsSearchableForType', () => {
    it.each(['text', 'keyword'])('defaults %s to searchable', (fieldType) => {
        expect(defaultIsSearchableForType(fieldType)).toBe(true);
    });

    it.each(['number', 'integer', 'float', 'double', 'date', 'datetime', 'boolean'])(
        'defaults %s to not searchable',
        (fieldType) => {
            expect(defaultIsSearchableForType(fieldType)).toBe(false);
        },
    );
});
