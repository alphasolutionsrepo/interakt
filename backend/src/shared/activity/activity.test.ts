import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));

/** A window with a working or a broken localStorage, enough for the store */
function stubWindow(storage: 'ok' | 'broken' = 'ok') {
    const data = new Map<string, string>();
    const localStorage = storage === 'ok'
        ? {
            getItem: (k: string) => data.get(k) ?? null,
            setItem: (k: string, v: string) => void data.set(k, v),
        }
        : {
            getItem: () => { throw new Error('SecurityError'); },
            setItem: () => { throw new Error('SecurityError'); },
        };
    vi.stubGlobal('window', { localStorage, addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() });
    return data;
}

async function loadModules() {
    vi.resetModules();
    const store = await import('./activity-store');
    const report = await import('./report');
    const cache = await import('./mutation-cache');
    const api = await import('@/shared/api/api-error');
    return { ...store, ...report, ...cache, ApiError: api.ApiError };
}

beforeEach(() => {
    toastError.mockClear();
    vi.unstubAllGlobals();
});

describe('activityStore', () => {
    it('keeps the newest 100 entries, newest first, and survives a reload', async () => {
        const data = stubWindow();
        const { activityStore } = await loadModules();
        for (let i = 0; i < 105; i++) activityStore.add({ action: `Action ${i}`, kind: 'error', message: 'x' });
        expect(activityStore.get()).toHaveLength(100);
        expect(activityStore.get()[0].action).toBe('Action 104');

        // A new page load reads what was saved
        vi.resetModules();
        const reloaded = await import('./activity-store');
        expect(data.get('interakt.activity')).toBeTruthy();
        expect(reloaded.activityStore.get()[0].action).toBe('Action 104');
    });

    it('starts empty on corrupt data and works when storage is blocked', async () => {
        const data = stubWindow();
        data.set('interakt.activity', '{not json');
        let { activityStore } = await loadModules();
        expect(activityStore.get()).toEqual([]);

        stubWindow('broken');
        ({ activityStore } = await loadModules());
        activityStore.add({ action: 'Save', kind: 'error', message: 'Failed' });
        expect(activityStore.get()).toHaveLength(1);
    });

    it('marks entries read and clears them', async () => {
        stubWindow();
        const { activityStore } = await loadModules();
        activityStore.add({ action: 'Save', kind: 'error', message: 'Failed' });
        activityStore.markAllRead();
        expect(activityStore.get()[0].read).toBe(true);
        activityStore.clear();
        expect(activityStore.get()).toEqual([]);
    });
});

describe('errorEntry', () => {
    it('keeps what the server said about an API error', async () => {
        stubWindow();
        const { errorEntry, entryAsText, ApiError } = await loadModules();
        const error = new ApiError('Azure AI Search rejected the credentials.', 502, {
            code: 'UPSTREAM_AUTH',
            hint: 'Check the admin key.',
            details: { provider: 'Azure AI Search', status: 403 },
            requestId: 'abc123',
        });
        const entry = errorEntry('Reindex', error);
        expect(entry).toMatchObject({ action: 'Reindex', code: 'UPSTREAM_AUTH', hint: 'Check the admin key.', requestId: 'abc123', httpStatus: 502 });
        const text = entryAsText({ ...entry, id: '1', at: new Date().toISOString(), read: false });
        expect(text).toContain('Request id: abc123');
        expect(text).toContain('What to try: Check the admin key.');
    });

    it('reads an error kept as data and plain errors', async () => {
        stubWindow();
        const { errorEntry } = await loadModules();
        expect(errorEntry('Reindex', { code: 'UPSTREAM_TIMEOUT', message: 'Too slow', hint: 'Try again' }))
            .toMatchObject({ message: 'Too slow', code: 'UPSTREAM_TIMEOUT', hint: 'Try again' });
        expect(errorEntry('Save', new Error('Boom'))).toMatchObject({ message: 'Boom' });
        expect(errorEntry('Save', 'Not reachable')).toMatchObject({ message: 'Not reachable' });
    });
});

describe('the mutation cache', () => {
    async function runMutation(meta: Record<string, unknown>, fn: () => Promise<unknown>) {
        const { createActionMutationCache, activityStore } = await loadModules();
        const client = new QueryClient({ mutationCache: createActionMutationCache() });
        const mutation = client.getMutationCache().build(client, { mutationFn: fn, meta, retry: false });
        await mutation.execute(undefined).catch(() => undefined);
        return activityStore.get();
    }

    it('records a failed action once, with a notice', async () => {
        stubWindow();
        const error = new Error('Name taken');
        const entries = await runMutation({ label: 'Create search index' }, async () => { throw error; });
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ action: 'Create search index', message: 'Name taken', kind: 'error' });
        expect(toastError).toHaveBeenCalledTimes(1);

        // A component reporting the same error again in its catch adds nothing
        const { reportActionError, activityStore } = await import('./report').then(async (r) => ({ ...r, ...(await import('./activity-store')) }));
        reportActionError('Create search index', error);
        expect(activityStore.get()).toHaveLength(1);
    });

    it('leaves errors of inline forms to the form', async () => {
        stubWindow();
        const entries = await runMutation({ label: 'Create user', inlineError: true }, async () => { throw new Error('x'); });
        expect(entries).toHaveLength(0);
        expect(toastError).not.toHaveBeenCalled();
    });

    it('records the success of long-running jobs', async () => {
        stubWindow();
        const entries = await runMutation({ label: 'Reindex', job: true }, async () => ({ message: 'Reindex completed successfully' }));
        expect(entries[0]).toMatchObject({ action: 'Reindex', kind: 'job', status: 'succeeded', message: 'Reindex completed successfully' });
        expect(toastError).not.toHaveBeenCalled();
    });
});
