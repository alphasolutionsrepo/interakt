// Our validation wording and codes, through the app's zod (the real library, no mocks): every
// schema built from '@/shared/validation/zod' gets these messages unless it names its own.
import { describe, expect, it } from 'vitest';

import { FIELD_ERROR_CODES, fieldErrorCode, fieldErrorsFromIssues } from './validation-messages';
import { z } from './zod';

function firstIssue(schema: z.ZodType, input: unknown) {
    const result = schema.safeParse(input);
    if (result.success) throw new Error('expected the input to be rejected');
    return result.error.issues[0];
}

function messageFor(schema: z.ZodType, input: unknown): string {
    return firstIssue(schema, input).message;
}

describe('validation messages', () => {
    it('says a missing value is required, and names the type for a wrong one', () => {
        const schema = z.object({ name: z.string(), size: z.number(), on: z.boolean(), tags: z.array(z.string()) });
        expect(messageFor(schema, {})).toBe('This field is required.');
        expect(messageFor(z.object({ name: z.string() }), { name: 5 })).toBe('Enter text.');
        expect(messageFor(z.object({ size: z.number() }), { size: 'x' })).toBe('Enter a number.');
        expect(messageFor(z.object({ on: z.boolean() }), { on: 'yes' })).toBe('Enter true or false.');
        expect(messageFor(z.object({ tags: z.array(z.string()) }), { tags: 'a' })).toBe('Enter a list.');
    });

    it('gives lengths, item counts and number bounds', () => {
        expect(messageFor(z.string().min(1), '')).toBe("This field can't be empty.");
        expect(messageFor(z.string().min(3), 'ab')).toBe('Enter at least 3 characters.');
        expect(messageFor(z.string().max(1), 'ab')).toBe('Enter at most 1 character.');
        expect(messageFor(z.array(z.string()).min(2), ['a'])).toBe('Add at least 2 items.');
        expect(messageFor(z.array(z.string()).max(1), ['a', 'b'])).toBe('Add at most 1 item.');
        expect(messageFor(z.number().min(1), 0)).toBe('Enter a number of at least 1.');
        expect(messageFor(z.number().max(100), 101)).toBe('Enter a number of at most 100.');
        expect(messageFor(z.number().positive(), 0)).toBe('Enter a number greater than 0.');
        expect(messageFor(z.number().lt(5), 5)).toBe('Enter a number less than 5.');
        expect(messageFor(z.number().multipleOf(5), 7)).toBe('Enter a multiple of 5.');
    });

    it('explains formats, allowed values and unknown fields', () => {
        expect(messageFor(z.string().email(), 'x')).toBe('Enter a valid email address.');
        expect(messageFor(z.string().url(), 'not a url')).toBe('Enter a valid URL.');
        expect(messageFor(z.string().uuid(), 'abc')).toBe('Enter a valid ID.');
        expect(messageFor(z.string().regex(/^\d+$/), 'x')).toBe("This value isn't in the expected format.");
        expect(messageFor(z.enum(['asc', 'desc']), 'up')).toBe('Choose one of: "asc", "desc".');
        expect(messageFor(z.literal('CONFIRM'), 'no')).toBe('Must be "CONFIRM".');
        const many = z.enum(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']);
        expect(messageFor(many, 'z')).toBe("This value isn't one of the allowed options.");
        expect(messageFor(z.object({ a: z.string() }).strict(), { a: 'x', b: 1 })).toBe('Unknown field: "b".');
        expect(messageFor(z.object({}).strict(), { b: 1, c: 2 })).toBe('Unknown fields: "b", "c".');
        expect(messageFor(z.string().refine(() => false), 'x')).toBe("This value isn't valid.");
    });

    it("keeps a schema's own message", () => {
        expect(messageFor(z.string().min(3, 'Name must be at least 3 characters'), 'ab')).toBe('Name must be at least 3 characters');
        expect(messageFor(z.literal('CONFIRM', { error: 'You must type CONFIRM to proceed' }), 'no')).toBe('You must type CONFIRM to proceed');
        expect(messageFor(z.string().refine(() => false, 'Pick another name'), 'x')).toBe('Pick another name');
    });
});

describe('field error codes', () => {
    it('are the documented list, in a fixed order (clients rely on them; only ever add)', () => {
        expect(FIELD_ERROR_CODES).toEqual([
            'invalid_type', 'too_small', 'too_big', 'invalid_format', 'invalid_value', 'unrecognized_key', 'invalid',
        ]);
    });

    it('maps each kind of problem to its code', () => {
        const code = (schema: z.ZodType, input: unknown) => fieldErrorCode(firstIssue(schema, input));
        expect(code(z.object({ a: z.string() }), {})).toBe('invalid_type');
        expect(code(z.string(), 1)).toBe('invalid_type');
        expect(code(z.string().min(2), 'a')).toBe('too_small');
        expect(code(z.number().max(1), 2)).toBe('too_big');
        expect(code(z.string().email(), 'x')).toBe('invalid_format');
        expect(code(z.enum(['a']), 'b')).toBe('invalid_value');
        expect(code(z.number().multipleOf(2), 3)).toBe('invalid_value');
        expect(code(z.object({}).strict(), { x: 1 })).toBe('unrecognized_key');
        expect(code(z.string().refine(() => false), 'x')).toBe('invalid');
        expect(code(z.union([z.string(), z.number()]), true)).toBe('invalid');
    });

    it('turns a zod error into field, code and message, with the path dot-joined', () => {
        const schema = z.object({ filters: z.array(z.object({ value: z.number().max(10) })) });
        const result = schema.safeParse({ filters: [{ value: 1 }, { value: 50 }] });
        expect(result.success).toBe(false);
        expect(fieldErrorsFromIssues(result.error!.issues)).toEqual([
            { field: 'filters.1.value', code: 'too_big', message: 'Enter a number of at most 10.' },
        ]);
    });
});
