// src/shared/activity/activity-store.ts

/**
 * What happened to the user's recent actions, kept in this browser so a failure
 * is still there after the notice is closed, the page is left or reloaded. Failed
 * mutations are added by the QueryProvider; background work (reindex, uploads)
 * adds an entry when it finishes either way.
 *
 * localStorage only: nothing is sent anywhere. The server redacts error details
 * before they reach the browser, and the list is cleared on sign-out because
 * machines are shared. Every storage access is guarded: in a private window or
 * with storage blocked the list simply lives in memory for the page.
 */

import { ApiError, type ApiErrorBody } from '@/shared/api/api-error';

export interface ActivityEntry {
    id: string;
    /** ISO time */
    at: string;
    /** What the user did, e.g. "Reindex products" */
    action: string;
    kind: 'error' | 'job';
    /** For jobs: how it ended */
    status?: 'succeeded' | 'failed';
    message: string;
    hint?: string;
    code?: string;
    httpStatus?: number;
    details?: unknown;
    requestId?: string;
    /** Where to see it, e.g. the index page for a reindex */
    href?: string;
    read: boolean;
}

export type NewActivityEntry = Omit<ActivityEntry, 'id' | 'at' | 'read'>;

const STORAGE_KEY = 'interakt.activity';
const MAX_ENTRIES = 100;

type Listener = () => void;

const listeners = new Set<Listener>();
let entries: ActivityEntry[] | null = null;
const EMPTY: ActivityEntry[] = [];

function load(): ActivityEntry[] {
    if (entries) return entries;
    entries = [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) {
            entries = parsed.filter((e) => e && typeof e.id === 'string' && typeof e.message === 'string').slice(0, MAX_ENTRIES);
        }
    } catch {
        // Corrupt or blocked storage: start empty
    }
    return entries;
}

function save(next: ActivityEntry[]) {
    entries = next;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Full or blocked storage: keep the list in memory for this page
    }
    listeners.forEach((listener) => listener());
}

function newId(): string {
    try {
        return crypto.randomUUID();
    } catch {
        return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
}

export const activityStore = {
    get(): ActivityEntry[] {
        if (typeof window === 'undefined') return EMPTY;
        return load();
    },

    add(entry: NewActivityEntry): ActivityEntry {
        const full: ActivityEntry = { ...entry, id: newId(), at: new Date().toISOString(), read: false };
        if (typeof window !== 'undefined') save([full, ...load()].slice(0, MAX_ENTRIES));
        return full;
    },

    markAllRead() {
        const current = load();
        if (current.some((e) => !e.read)) save(current.map((e) => (e.read ? e : { ...e, read: true })));
    },

    clear() {
        if (typeof window === 'undefined') return;
        save([]);
    },

    subscribe(listener: Listener): () => void {
        listeners.add(listener);
        const onStorage = (event: StorageEvent) => {
            // Another tab changed the list
            if (event.key === STORAGE_KEY || event.key === null) {
                entries = null;
                listener();
            }
        };
        window.addEventListener('storage', onStorage);
        return () => {
            listeners.delete(listener);
            window.removeEventListener('storage', onStorage);
        };
    },
};

/** An activity entry for a failed action, from whatever the action threw */
export function errorEntry(action: string, error: unknown): NewActivityEntry {
    if (error instanceof ApiError) {
        return {
            action,
            kind: 'error',
            message: error.message,
            hint: error.hint,
            code: error.code,
            httpStatus: error.status,
            details: error.details,
            requestId: error.requestId,
        };
    }
    // An error body kept as data, e.g. the last job's error on a search index
    if (error && typeof error === 'object' && !(error instanceof Error) && typeof (error as ApiErrorBody).message === 'string') {
        const body = error as ApiErrorBody;
        return { action, kind: 'error', message: body.message!, hint: body.hint, code: body.code, details: body.details, requestId: body.requestId };
    }
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'The action failed';
    return { action, kind: 'error', message };
}

/** The entry as plain text, for pasting into a support request */
export function entryAsText(entry: ActivityEntry): string {
    const lines = [
        `${entry.action}: ${entry.message}`,
        entry.hint && `What to try: ${entry.hint}`,
        `Time: ${new Date(entry.at).toISOString()}`,
        entry.code && `Code: ${entry.code}${entry.httpStatus ? ` (HTTP ${entry.httpStatus})` : ''}`,
        entry.requestId && `Request id: ${entry.requestId}`,
        entry.details !== undefined && `Details: ${JSON.stringify(entry.details, null, 2)}`,
    ];
    return lines.filter(Boolean).join('\n');
}
