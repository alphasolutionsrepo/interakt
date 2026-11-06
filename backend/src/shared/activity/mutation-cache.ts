// src/shared/activity/mutation-cache.ts

/**
 * The QueryClient's MutationCache: where every failed action is reported, so hooks
 * don't each need an onError. A mutation names its action with meta.label; with
 * meta.inlineError the form shows and records the error itself; with meta.job a
 * success is recorded too (see report.ts).
 */

import { MutationCache } from '@tanstack/react-query';

import type { NewActivityEntry } from './activity-store';
import { reportActionError, reportJobResult } from './report';

import type { IndexLastJob } from '@/db/schema/search-index.schema';

export function createActionMutationCache(): MutationCache {
    return new MutationCache({
        onError: (error, _variables, _context, mutation) => {
            if (mutation.meta?.inlineError) return;
            reportActionError(mutation.meta?.label ?? 'Action', error);
        },
        onSuccess: (data, _variables, _context, mutation) => {
            if (!mutation.meta?.job) return;
            reportJobResult(jobResult(mutation.meta.label ?? 'Job', data));
        },
    });
}

/**
 * How a job that answered ended. A job that records its outcome (an upload's
 * outcome) is taken at its word: the request succeeding doesn't mean the work did.
 */
function jobResult(action: string, data: unknown): Omit<NewActivityEntry, 'kind'> {
    const { outcome, message } = (data ?? {}) as { outcome?: IndexLastJob; message?: unknown };
    if (outcome && outcome.status !== 'running') {
        return {
            action,
            status: outcome.status,
            message: outcome.error?.message ?? outcome.summary ?? (typeof message === 'string' ? message : 'Finished'),
            hint: outcome.error?.hint,
            code: outcome.error?.code,
            details: outcome.error?.details,
            requestId: outcome.error?.requestId,
        };
    }
    return { action, status: 'succeeded', message: typeof message === 'string' ? message : 'Finished' };
}
