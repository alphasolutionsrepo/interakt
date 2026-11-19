// src/shared/validation/validation-messages.ts

/**
 * Our own wording and codes for validation problems.
 *
 * zod's default messages are written for developers and change between zod versions, and they
 * reach people: field errors in API responses and under admin form fields. So the wording is
 * ours, set once here (registered in ./zod.ts), and a schema can still give a field its own
 * message, which wins over these.
 *
 * Each field error in an API response also carries a code from FIELD_ERROR_CODES. The codes are
 * part of the API contract: clients can rely on them, while the message is for people and may
 * be improved over time. They are our names, not zod's, so a zod upgrade can't change them.
 */

import type { core } from 'zod';

/** Field error codes in API responses. Documented in the API docs; only ever add to this list. */
export const FIELD_ERROR_CODES = [
    'invalid_type',
    'too_small',
    'too_big',
    'invalid_format',
    'invalid_value',
    'unrecognized_key',
    'invalid',
] as const;

export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number];

/** A finished zod issue: what a ZodError holds (the input value is no longer on it). */
type FinishedIssue = { code: string; path: PropertyKey[]; message: string };

/** The code a client sees for a zod issue. A missing value is `invalid_type`; its message says it is required. */
export function fieldErrorCode(issue: { code: string }): FieldErrorCode {
    switch (issue.code) {
        case 'invalid_type':
            return 'invalid_type';
        case 'too_small':
            return 'too_small';
        case 'too_big':
            return 'too_big';
        case 'invalid_format':
            return 'invalid_format';
        case 'invalid_value':
        case 'not_multiple_of':
            return 'invalid_value';
        case 'unrecognized_keys':
            return 'unrecognized_key';
        default:
            return 'invalid';
    }
}

/** A zod error's issues as the field errors our API and forms use. */
export function fieldErrorsFromIssues(issues: readonly FinishedIssue[]): Array<{ field: string; code: FieldErrorCode; message: string }> {
    return issues.map((issue) => ({
        field: issue.path.map(String).join('.'),
        code: fieldErrorCode(issue),
        message: issue.message,
    }));
}

const TYPE_NAMES: Record<string, string> = {
    string: 'text',
    number: 'a number',
    int: 'a whole number',
    bigint: 'a whole number',
    boolean: 'true or false',
    array: 'a list',
    object: 'an object',
    record: 'an object',
    date: 'a date',
};

const FORMAT_MESSAGES: Record<string, string> = {
    email: 'Enter a valid email address.',
    url: 'Enter a valid URL.',
    uuid: 'Enter a valid ID.',
    guid: 'Enter a valid ID.',
    datetime: 'Enter a valid date and time.',
    date: 'Enter a valid date.',
    time: 'Enter a valid time.',
    ipv4: 'Enter a valid IP address.',
    ipv6: 'Enter a valid IP address.',
    json_string: 'Enter valid JSON.',
};

function plural(n: number | bigint, one: string, many: string): string {
    return `${n} ${Number(n) === 1 ? one : many}`;
}

function tooSmall(issue: core.$ZodRawIssue<core.$ZodIssueTooSmall>): string {
    const min = issue.minimum;
    switch (issue.origin) {
        case 'string':
            return Number(min) <= 1 ? "This field can't be empty." : `Enter at least ${plural(min as number, 'character', 'characters')}.`;
        case 'array':
        case 'set':
            return `Add at least ${plural(min as number, 'item', 'items')}.`;
        case 'number':
        case 'int':
        case 'bigint':
            return issue.inclusive ? `Enter a number of at least ${min}.` : `Enter a number greater than ${min}.`;
        case 'date':
            return 'Enter a later date.';
        default:
            return 'This value is too small.';
    }
}

function tooBig(issue: core.$ZodRawIssue<core.$ZodIssueTooBig>): string {
    const max = issue.maximum;
    switch (issue.origin) {
        case 'string':
            return `Enter at most ${plural(max as number, 'character', 'characters')}.`;
        case 'array':
        case 'set':
            return `Add at most ${plural(max as number, 'item', 'items')}.`;
        case 'number':
        case 'int':
        case 'bigint':
            return issue.inclusive ? `Enter a number of at most ${max}.` : `Enter a number less than ${max}.`;
        case 'date':
            return 'Enter an earlier date.';
        default:
            return 'This value is too large.';
    }
}

/** Longer option lists aren't spelled out in the message. */
const MAX_LISTED_VALUES = 10;

function quoteValue(v: unknown): string {
    return typeof v === 'string' ? `"${v}"` : String(v);
}

/**
 * The message for an issue, in our wording. Registered as zod's customError (see ./zod.ts), so it
 * runs only when the schema didn't give its own message.
 */
export function validationMessage(issue: core.$ZodRawIssue): string {
    switch (issue.code) {
        case 'invalid_type': {
            if (issue.input === undefined) return 'This field is required.';
            const name = TYPE_NAMES[issue.expected];
            return name ? `Enter ${name}.` : 'This value has the wrong type.';
        }
        case 'too_small':
            return tooSmall(issue);
        case 'too_big':
            return tooBig(issue);
        case 'invalid_format':
            return FORMAT_MESSAGES[issue.format] ?? "This value isn't in the expected format.";
        case 'not_multiple_of':
            return `Enter a multiple of ${issue.divisor}.`;
        case 'invalid_value': {
            const values = issue.values;
            if (values.length === 1) return `Must be ${quoteValue(values[0])}.`;
            if (values.length > MAX_LISTED_VALUES) return "This value isn't one of the allowed options.";
            return `Choose one of: ${values.map(quoteValue).join(', ')}.`;
        }
        case 'unrecognized_keys':
            return issue.keys.length === 1
                ? `Unknown field: "${issue.keys[0]}".`
                : `Unknown fields: ${issue.keys.map((k) => `"${k}"`).join(', ')}.`;
        case 'invalid_key':
            return 'This key is not valid.';
        default:
            return "This value isn't valid.";
    }
}
