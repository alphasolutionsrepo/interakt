// app/search-indexes/_components/LastJobBanner.tsx

/**
 * What happened to the last reindex, recreate or upload of this index, kept on the
 * index itself (lastJob), so the answer is still here after the user left the page
 * or reloaded. Running jobs show progress; a failed one says why and what to try,
 * until the next job replaces it. Successes show nothing: the page already does.
 */

'use client';

import { Loader2 } from 'lucide-react';

import type { IndexLastJob } from '@/db/schema/search-index.schema';
import { ProblemAlert } from '@/shared/ui/custom/ProblemAlert';

const JOB_NAMES: Record<IndexLastJob['kind'], string> = {
    reindex: 'Reindex',
    recreate: 'Recreate index',
    upload: 'Document upload',
};

// A job still "running" after this long most likely stopped with the server
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

function formatTime(iso: string): string {
    const date = new Date(iso);
    const sameDay = date.toDateString() === new Date().toDateString();
    return sameDay
        ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function LastJobBanner({ lastJob }: { lastJob?: IndexLastJob | null }) {
    if (!lastJob) return null;
    const name = JOB_NAMES[lastJob.kind] ?? 'Job';

    if (lastJob.status === 'running') {
        const stale = Date.now() - new Date(lastJob.startedAt).getTime() > STALE_AFTER_MS;
        return (
            <div className="flex items-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-50/50 px-4 py-3 text-sm text-sky-900 dark:bg-sky-950/20 dark:text-sky-200">
                {!stale && <Loader2 className="size-4 animate-spin" />}
                {stale
                    ? `${name} started at ${formatTime(lastJob.startedAt)} and never reported back. The server may have restarted; run it again.`
                    : `${name} running since ${formatTime(lastJob.startedAt)}…`}
            </div>
        );
    }

    if (lastJob.status === 'failed' && lastJob.error) {
        return (
            <ProblemAlert
                className="rounded-2xl"
                title={`${name} failed at ${formatTime(lastJob.finishedAt ?? lastJob.startedAt)}`}
                error={lastJob.error}
            />
        );
    }

    return null;
}
