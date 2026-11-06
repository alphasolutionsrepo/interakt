// src/shared/activity/report.ts

/**
 * One place a failed action is reported: it goes into the activity list, and unless
 * the screen already shows it next to the form (inline), a notice appears that
 * stays until it is closed, with Details opening the Activity panel at that entry.
 *
 * Failed mutations arrive here from the QueryProvider's MutationCache. Name the
 * action on the mutation with meta: { label: 'Reindex' }. When a form or dialog shows
 * the error itself (<ProblemAlert> via useInlineError), set inlineError on the
 * mutation: the form then records it, and the MutationCache leaves it alone.
 */

import { toast } from 'sonner';

import { activityStore, errorEntry, type ActivityEntry, type NewActivityEntry } from './activity-store';

export interface ActionMeta extends Record<string, unknown> {
    /** What the user did, shown in the Activity panel, e.g. "Delete search index" */
    label?: string;
    /** The form or dialog shows and records the error itself (useInlineError) */
    inlineError?: boolean;
    /** Long-running work (reindex, upload): its success goes in the Activity panel too */
    job?: boolean;
}

declare module '@tanstack/react-query' {
    interface Register {
        mutationMeta: ActionMeta;
    }
}

export const OPEN_ACTIVITY_EVENT = 'interakt:open-activity';

export interface OpenActivityDetail {
    entryId?: string;
}

/** Open the Activity panel, optionally with one entry expanded */
export function openActivity(detail: OpenActivityDetail = {}) {
    window.dispatchEvent(new CustomEvent<OpenActivityDetail>(OPEN_ACTIVITY_EVENT, { detail }));
}

// Errors already recorded. A component that awaits a mutation and reports its error
// in a catch would otherwise record it a second time after the MutationCache did.
const reported = new WeakSet<object>();

/** Record a failed action and, unless it is shown inline, show a notice that stays */
export function reportActionError(action: string, error: unknown, options: { inline?: boolean } = {}) {
    if (typeof error === 'object' && error !== null) {
        if (reported.has(error)) return undefined;
        reported.add(error);
    }
    const entry = activityStore.add(errorEntry(action, error));
    if (options.inline) return entry;

    notify(entry, 'failed');
    return entry;
}

/**
 * Record how a background job ended. A failure gets a notice that stays until it is
 * closed; a partial result (some of the work failed) one that goes away by itself.
 */
export function reportJobResult(entry: Omit<NewActivityEntry, 'kind'>) {
    const added = activityStore.add({ ...entry, kind: 'job' });
    if (entry.status === 'failed' || entry.status === 'partial') notify(added, entry.status);
    return added;
}

function notify(entry: ActivityEntry, status: 'failed' | 'partial') {
    const options = {
        id: entry.id,
        description: entry.hint ? `${entry.message} ${entry.hint}` : entry.message,
        closeButton: true,
        action: { label: 'Details', onClick: () => openActivity({ entryId: entry.id }) },
    };
    if (status === 'failed') toast.error(`${entry.action} failed`, { ...options, duration: Infinity });
    else toast.warning(`${entry.action} finished with problems`, options);
}
