// src/shared/cache/cache-store.test.ts

/**
 * The in-memory CacheStore: a cached null counts as an entry, one load for concurrent callers, a
 * failed load is not cached, a delete made while a load runs keeps its result out, entries expire,
 * and the oldest entry goes first once the store is full.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { memoryCacheStore } from './cache-store';

afterEach(() => vi.useRealTimers());

describe('memoryCacheStore', () => {
  it('keeps a cached null as an entry, apart from no entry at all', async () => {
    const store = memoryCacheStore<string | null>('test', { maxSize: 10 });
    expect(await store.get('k')).toBeUndefined();
    await store.set('k', null, 1_000);
    expect(await store.get('k')).toBeNull();
    let loads = 0;
    expect(await store.getOrSet('k', async () => { loads++; return 'loaded'; }, 1_000)).toBeNull();
    expect(loads).toBe(0);
  });

  it('loads once for callers asking at the same time', async () => {
    const store = memoryCacheStore<number>('test', { maxSize: 10 });
    let loads = 0;
    const values = await Promise.all(Array.from({ length: 10 }, () => store.getOrSet('k', async () => ++loads, 1_000)));
    expect(values).toEqual(Array(10).fill(1));
    expect(loads).toBe(1);
  });

  it("doesn't cache a failed load", async () => {
    const store = memoryCacheStore<string>('test', { maxSize: 10 });
    await expect(store.getOrSet('k', async () => { throw new Error('down'); }, 1_000)).rejects.toThrow('down');
    expect(await store.getOrSet('k', async () => 'ok', 1_000)).toBe('ok');
  });

  it('keeps the result of a load out when the entry is deleted while it runs', async () => {
    const store = memoryCacheStore<string>('test', { maxSize: 10 });
    let finish: (value: string) => void = () => {};
    const running = store.getOrSet('k', () => new Promise<string>((resolve) => { finish = resolve; }), 1_000);
    await store.delete('k');
    finish('stale');
    expect(await running).toBe('stale');
    expect(await store.get('k')).toBeUndefined();
  });

  it('drops an entry once its time is over', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const store = memoryCacheStore<string>('test', { maxSize: 10 });
    await store.set('k', 'v', 1_000);
    vi.setSystemTime(Date.now() + 1_001);
    expect(await store.get('k')).toBeUndefined();
  });

  it('drops the oldest entry once full, and clear drops them all', async () => {
    const store = memoryCacheStore<number>('test', { maxSize: 2 });
    await store.set('a', 1, 1_000);
    await store.set('b', 2, 1_000);
    await store.set('c', 3, 1_000);
    expect(await store.get('a')).toBeUndefined();
    expect(await store.get('c')).toBe(3);
    await store.clear();
    expect(await store.get('b')).toBeUndefined();
    expect(await store.get('c')).toBeUndefined();
  });
});
