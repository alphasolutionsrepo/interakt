// The public v1 OpenAPI spec: it builds from the real schemas, documents the error shape the API
// sends, and the copy the docs site publishes is the one the code generates.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';

import { buildOpenApiDocument } from './public-api.openapi';

import { FIELD_ERROR_CODES } from '@/shared/validation/validation-messages';

const PUBLISHED_SPEC = resolve(__dirname, '../../../../docs-site/static/openapi/interakt-v1.yaml');

type Schema = { properties?: Record<string, Schema>; items?: Schema; enum?: unknown[]; $ref?: string; required?: string[] };

describe('public API OpenAPI spec', () => {
    const doc = buildOpenApiDocument();
    const schemas = (doc.components?.schemas ?? {}) as Record<string, Schema>;

    it('registers the request bodies imported from the feature modules', () => {
        for (const name of ['SearchRequest', 'AutocompleteRequest', 'SummarizeRequest', 'ChatRequest']) {
            expect(schemas[name], name).toBeDefined();
        }
    });

    it('documents field errors with their stable codes, as fields and as details', () => {
        expect(schemas.FieldError.properties?.code.enum).toEqual([...FIELD_ERROR_CODES]);
        expect(schemas.FieldError.required).toEqual(expect.arrayContaining(['field', 'code', 'message']));
        const error = schemas.ErrorResponse.properties!;
        expect(error.fields.items?.$ref).toBe('#/components/schemas/FieldError');
        expect(error.details.items?.$ref).toBe('#/components/schemas/FieldError');
        expect(Object.keys(error)).toEqual(expect.arrayContaining(['success', 'code', 'message', 'error', 'requestId']));
    });

    it('matches the copy the docs site publishes (run `npm run openapi:generate` after changing the API)', () => {
        expect(readFileSync(PUBLISHED_SPEC, 'utf8')).toBe(stringify(doc));
    });
});
