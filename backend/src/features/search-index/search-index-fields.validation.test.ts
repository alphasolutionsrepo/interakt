// src/features/search-index/search-index-fields.validation.test.ts

/**
 * Field creation request schema.
 *
 * The regression guarded here: isSearchable carried a schema-level
 * `.default(true)`, so a request that omitted it arrived at the service with a
 * concrete `true` and the type-aware default (defaultIsSearchableForType) never
 * ran. A numeric field created over HTTP was stored searchable, which Azure
 * rejects at query time — "Field 'priceAmount' is not marked as 'searchable'".
 *
 * The service-level test cannot cover this: it calls createField() directly,
 * below the schema. These assert the API boundary leaves the decision to the
 * service.
 */

import { describe, it, expect } from 'vitest';
import { createSearchIndexFieldSchema } from './search-index-fields.validation';

function numericFieldInput() {
    return {
        fieldName: 'priceAmount',
        fieldType: 'number',
    };
}

describe('createSearchIndexFieldSchema — isSearchable', () => {
    it('leaves it undefined when omitted, so the service default applies', () => {
        const parsed = createSearchIndexFieldSchema.parse(numericFieldInput());

        expect(parsed.isSearchable).toBeUndefined();
    });

    it('rejects an explicit true on a numeric field', () => {
        // Elasticsearch fails the whole query ("failed to create query: For input
        // string") when the query text is sent to a numeric field, so the flag
        // must never be stored for one.
        const result = createSearchIndexFieldSchema.safeParse({
            ...numericFieldInput(),
            isSearchable: true,
        });

        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.path).toEqual(['isSearchable']);
    });

    it.each(['text', 'keyword', 'array'])('accepts an explicit true on a %s field', (fieldType) => {
        const parsed = createSearchIndexFieldSchema.parse({
            fieldName: 'tags',
            fieldType,
            isSearchable: true,
        });

        expect(parsed.isSearchable).toBe(true);
    });

    it('preserves an explicit false', () => {
        const parsed = createSearchIndexFieldSchema.parse({
            fieldName: 'title',
            fieldType: 'text',
            isSearchable: false,
        });

        expect(parsed.isSearchable).toBe(false);
    });
});
