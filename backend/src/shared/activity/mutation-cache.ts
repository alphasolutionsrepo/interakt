// src/shared/activity/mutation-cache.ts

/**
 * The QueryClient's MutationCache: where every failed action is reported, so hooks
 * don't each need an onError. A mutation names its action with meta.label; with
 * meta.inlineError the form shows and records the error itself; with meta.job a
 * success is recorded too (see report.ts).
 */

import { MutationCache } from '@tanstack/react-query';

import { reportActionError, reportJobResult } from './report';

export function createActionMutationCache(): MutationCache {
    return new MutationCache({
        onError: (error, _variables, _context, mutation) => {
            if (mutation.meta?.inlineError) return;
            reportActionError(mutation.meta?.label ?? 'Action', error);
        },
        onSuccess: (data, _variables, _context, mutation) => {
            if (!mutation.meta?.job) return;
            const message = (data as { message?: unknown } | undefined)?.message;
            reportJobResult({
                action: mutation.meta.label ?? 'Job',
                status: 'succeeded',
                message: typeof message === 'string' ? message : 'Finished',
            });
        },
    });
}
