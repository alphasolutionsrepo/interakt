// src/shared/activity/useInlineError.ts

'use client';

/**
 * The error a form or dialog shows itself, next to its submit button. capture()
 * records it in the Activity panel (without a notice: the user is looking at it),
 * puts field errors on the form's fields, and keeps the error for <ProblemAlert>:
 *
 *   const inline = useInlineError();
 *   try { await save(data) } catch (err) { inline.capture('Create provider', err, form) }
 *   <ProblemAlert error={inline.error} hideFields={inline.hideFields} onDismiss={inline.clear} />
 *
 * A mutation whose errors are shown this way sets meta: { inlineError: true }.
 */

import { useCallback, useState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { applyServerErrors } from '@/shared/api/apply-server-errors';

import { reportActionError } from './report';

export function useInlineError() {
    const [state, setState] = useState<{ error: unknown; fields: string[] } | null>(null);

    const capture = useCallback(<T extends FieldValues>(action: string, error: unknown, form?: Pick<UseFormReturn<T>, 'setError' | 'getValues'>) => {
        reportActionError(action, error, { inline: true });
        setState({ error, fields: form ? applyServerErrors(form, error) : [] });
    }, []);

    const clear = useCallback(() => setState(null), []);

    return { error: state?.error ?? null, hideFields: state?.fields ?? [], capture, clear };
}
