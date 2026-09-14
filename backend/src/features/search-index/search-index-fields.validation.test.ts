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

    it('preserves an explicit true', () => {
        const parsed = createSearchIndexFieldSchema.parse({
            ...numericFieldInput(),
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
