// src/shared/api/apply-server-errors.ts

/**
 * Put the server's field errors next to their fields in a react-hook-form form.
 * Only fields the form has are set (the server may name fields the form doesn't
 * show); the rest stay on the error for <ProblemAlert> to list. Returns the field
 * names that were set, to pass as ProblemAlert's hideFields.
 */

import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

import { ApiError } from './api-error';

export function applyServerErrors<T extends FieldValues>(
    form: Pick<UseFormReturn<T>, 'setError' | 'getValues'>,
    error: unknown,
    /** Fields the form shows whose value may be undefined, so they can't be found from the values */
    knownFields: string[] = []
): string[] {
    if (!(error instanceof ApiError) || !error.fields?.length) return [];

    const values = form.getValues() as Record<string, unknown>;
    const applied: string[] = [];
    for (const { field, message } of error.fields) {
        if (!field) continue;
        if (!knownFields.includes(field) && valueAt(values, field) === undefined) continue;
        form.setError(field as Path<T>, { type: 'server', message }, { shouldFocus: applied.length === 0 });
        applied.push(field);
    }
    return applied;
}

function valueAt(values: Record<string, unknown>, path: string): unknown {
    let current: unknown = values;
    for (const key of path.split('.')) {
        if (current === null || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}
