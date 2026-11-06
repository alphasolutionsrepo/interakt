import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError, ConflictError } from './app-error';
import { failureLevel, toAppError, writeFailureLevel } from './to-app-error';

import { SearchError } from '@/features/search/search.types';

describe('toAppError', () => {
    it('returns AppErrors as they are', () => {
        const err = new ConflictError('Name taken');
        expect(toAppError(err)).toBe(err);
    });

    it('turns Zod errors into field errors', () => {
        const result = z.object({ name: z.string().min(1), fields: z.array(z.object({ dimensions: z.number() })) })
            .safeParse({ name: '', fields: [{ dimensions: 'x' }] });
        const err = toAppError(!result.success && result.error);
        expect(err).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
        expect(err.fields?.map((f) => f.field)).toEqual(['name', 'fields.0.dimensions']);
    });

    it('maps the feature errors by name', () => {
        const inUse = Object.assign(new Error('Search index is still used by 1 config(s)'), { name: 'SearchIndexInUseError', references: [{ type: 'experience', name: 'Shop' }] });
        expect(toAppError(inUse)).toMatchObject({ code: 'CONFLICT', status: 409, details: { references: [{ type: 'experience', name: 'Shop' }] } });

        const experience = Object.assign(new Error('Slug already used'), { name: 'SearchExperienceError', code: 'DUPLICATE_SLUG', statusCode: 409 });
        expect(toAppError(experience)).toMatchObject({ code: 'DUPLICATE_SLUG', status: 409, message: 'Slug already used' });

        // A search error carries its status (SEARCH_ERROR_STATUS)
        expect(toAppError(new SearchError('At least one filter clause is required', 'INVALID_FILTER'))).toMatchObject({ code: 'INVALID_FILTER', status: 400 });
        expect(toAppError(new SearchError('Search index "shop" is not active', 'INDEX_NOT_READY')))
            .toMatchObject({ code: 'INDEX_NOT_READY', status: 503, message: 'Search index "shop" is not active' });
        expect(toAppError(new SearchError('An external search source is unavailable', 'SOURCE_UNAVAILABLE')))
            .toMatchObject({ code: 'SOURCE_UNAVAILABLE', status: 503, message: 'An external search source is unavailable' });

        const provider = Object.assign(new Error('Unsupported AI provider: foo'), { name: 'AIServiceError', code: 'PROVIDER_NOT_FOUND' });
        expect(toAppError(provider)).toMatchObject({ code: 'PROVIDER_NOT_FOUND', status: 400 });
    });

    it('classifies provider errors', () => {
        const err = Object.assign(new Error('Forbidden'), { name: 'RestError', statusCode: 403 });
        expect(toAppError(err)).toMatchObject({ code: 'UPSTREAM_AUTH', status: 502 });
    });

    it('hides anything else behind a generic message', () => {
        const cause = new Error('duplicate key value violates unique constraint "users_pkey"');
        const err = toAppError(cause);
        expect(err).toBeInstanceOf(AppError);
        expect(err).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
        expect(err.message).not.toContain('users_pkey');
        expect(err.cause).toBe(cause);
    });
});

describe('failureLevel', () => {
    it('is an error when our setup is at fault', () => {
        const disabled = Object.assign(new Error('Provider is disabled: openai'), { name: 'AIServiceError', code: 'PROVIDER_DISABLED' });
        expect(failureLevel(disabled, 'warn')).toBe('error');
    });

    it('is an error when a service we depend on failed', () => {
        expect(failureLevel(Object.assign(new Error('Too many requests'), { name: 'AdapterError', providerKey: 'openai', statusCode: 429 }), 'warn')).toBe('error');
    });

    it('is an error when the provider is cut off after failing (circuit open), though it names no provider', () => {
        const circuitOpen = Object.assign(new Error('Circuit breaker is open - provider temporarily unavailable'), { name: 'AIServiceError', code: 'CIRCUIT_OPEN' });
        expect(failureLevel(circuitOpen, 'warn')).toBe('error');
    });

    it("is the step's own level for a failure it doesn't recognise", () => {
        expect(failureLevel(new Error('No JSON array in response'), 'warn')).toBe('warn');
        expect(failureLevel(new Error('No JSON array in response'), 'error')).toBe('error');
    });

    it('is a warning when the request was wrong', () => {
        expect(failureLevel(new AppError('Unknown filter field "colour"', { code: 'INVALID_FILTER', status: 400 }), 'warn')).toBe('warn');
    });
});

describe('writeFailureLevel', () => {
    const blocked = 'index [shop] blocked by: [TOO_MANY_REQUESTS/12/disk usage exceeded flood-stage watermark, index has read-only-allow-delete block];';

    it('is a warning when the search service refused documents', () => {
        expect(writeFailureLevel(undefined, ['mapper_parsing_exception: failed to parse field [price]'])).toBe('warn');
    });

    it('is an error when the search service blocked writes, whichever document hit the block', () => {
        expect(writeFailureLevel(undefined, ['mapper_parsing_exception: failed to parse field [price]', blocked])).toBe('error');
    });
});
