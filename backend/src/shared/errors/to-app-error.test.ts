import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError, ConflictError } from './app-error';
import { toAppError } from './to-app-error';

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

        const filter = Object.assign(new Error('At least one filter clause is required'), { name: 'SearchError', code: 'INVALID_FILTER' });
        expect(toAppError(filter)).toMatchObject({ code: 'INVALID_FILTER', status: 400 });

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
        expect(err).toMatchObject({ code: 'INTERNAL', status: 500 });
        expect(err.message).not.toContain('users_pkey');
        expect(err.cause).toBe(cause);
    });
});
