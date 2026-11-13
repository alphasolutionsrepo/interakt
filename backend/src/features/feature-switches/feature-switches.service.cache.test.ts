// src/features/feature-switches/feature-switches.service.cache.test.ts

/**
 * The stored switches cache: a save keeps the last known switches for a failed read, a failed
 * read isn't retried on every request, and requests after expiry share one read.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ reads: 0, fails: false, failAfterSave: false, value: [] as string[], saved: null as string[] | null }));

vi.mock('server-only', () => ({}));
vi.mock('@/features/global-settings', () => ({
  getStoredFeaturesOff: vi.fn(async () => {
    db.reads++;
    await Promise.resolve();
    if (db.fails) throw new Error('database down');
    return db.value;
  }),
  updateFeaturesOff: vi.fn(async (change: (current: string[]) => string[]) => {
    const before = db.value;
    const after = change([...before]);
    db.saved = after; db.value = after;
    if (db.failAfterSave) db.fails = true;
    return { before, after };
  }),
}));

import { clearFeatureSwitchCache, isAreaOn, setFeatureSwitches } from './feature-switches.service';

import { getStoredFeaturesOff } from '@/features/global-settings';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  db.reads = 0; db.fails = false; db.failAfterSave = false; db.value = []; db.saved = null;
  delete process.env.INTERAKT_FEATURES_OFF;
  clearFeatureSwitchCache();
});
afterEach(() => { vi.useRealTimers(); });

describe('feature switch cache', () => {
  it('uses the saved state when reads fail after a save', async () => {
    expect(await isAreaOn('analytics')).toBe(true);
    // The database goes down right after the save, so the answer can only come from the saved state
    db.failAfterSave = true;
    const listed = await setFeatureSwitches({ analytics: false });
    expect(listed.find((a) => a.id === 'analytics')?.switchedOn).toBe(false);
    vi.advanceTimersByTime(6_000);
    expect(await isAreaOn('analytics')).toBe(false);
    expect(await isAreaOn('chat')).toBe(true);
  });

  it('does not read the database again within the backoff after a failed read', async () => {
    await isAreaOn('chat');
    db.fails = true;
    vi.advanceTimersByTime(6_000);
    const before = db.reads;
    await isAreaOn('chat');
    await isAreaOn('chat');
    await isAreaOn('chat');
    expect(db.reads - before).toBe(1);
    vi.advanceTimersByTime(6_000);
    await isAreaOn('chat');
    expect(db.reads - before).toBe(2);
  });

  it('shares one read between concurrent requests after expiry', async () => {
    await isAreaOn('chat');
    vi.advanceTimersByTime(6_000);
    const before = db.reads;
    await Promise.all(Array.from({ length: 10 }, () => isAreaOn('chat')));
    expect(db.reads - before).toBe(1);
  });

  it('keeps a save that finished while an older read was still under way', async () => {
    await isAreaOn('chat');
    vi.advanceTimersByTime(6_000);
    // The next read is held open and will answer with the old (empty) list
    let finishOldRead: (off: string[]) => void = () => {};
    vi.mocked(getStoredFeaturesOff).mockImplementationOnce(() => new Promise<string[]>((resolve) => { finishOldRead = resolve; }));
    const oldRead = isAreaOn('chat');
    // A save completes meanwhile (its own fresh read sees the store as it was)
    await setFeatureSwitches({ chat: false });
    expect(db.saved).toEqual(['chat']);
    finishOldRead([]);
    await oldRead;
    expect(await isAreaOn('chat')).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(await isAreaOn('chat')).toBe(false);
  });

  it('throws when nothing was read before and the read fails', async () => {
    db.fails = true;
    await expect(isAreaOn('chat')).rejects.toThrow('database down');
  });
});
