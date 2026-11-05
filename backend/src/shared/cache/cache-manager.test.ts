// src/shared/cache/cache-manager.test.ts

/**
 * CacheManager.deleteByPrefix.
 *
 * Added so one owner's entries can be dropped from a cache with compound keys —
 * the query interpreter keys interpretations as "<indexId>:<experienceId>:…" and
 * needs to clear a single index when its field configuration changes, without
 * clearing every other index along with it.
 */

import { describe, it, expect } from 'vitest';
import { CacheManager } from './cache-manager';

function seeded(): CacheManager {
    const cache = new CacheManager('test');
    cache.set('idx-1:exp-a:query one', 1);
    cache.set('idx-1:exp-b:query two', 2);
    cache.set('idx-2:exp-a:query one', 3);
    return cache;
}

describe('deleteByPrefix', () => {
    it('removes only the entries matching the prefix', async () => {
        const cache = seeded();

        const deleted = await cache.deleteByPrefix('idx-1:');

        expect(deleted).toBe(2);
        expect(cache.get('idx-1:exp-a:query one')).toBeNull();
        expect(cache.get('idx-1:exp-b:query two')).toBeNull();
        expect(cache.get('idx-2:exp-a:query one')).toBe(3);
    });

    it('reports zero when nothing matches and leaves the cache intact', async () => {
        const cache = seeded();

        expect(await cache.deleteByPrefix('idx-9:')).toBe(0);
        expect(cache.get('idx-1:exp-a:query one')).toBe(1);
    });

    it('does not treat a partial segment as a different key', async () => {
        const cache = new CacheManager('test');
        cache.set('idx-1:a', 1);
        cache.set('idx-10:a', 2);

        // "idx-1:" must not match "idx-10:" — the trailing separator is what
        // keeps one index id from swallowing another that shares its prefix.
        expect(await cache.deleteByPrefix('idx-1:')).toBe(1);
        expect(cache.get('idx-10:a')).toBe(2);
    });

    it('drops an in-flight factory so it cannot repopulate stale data', async () => {
        const cache = new CacheManager('test');
        let resolveFactory: (value: string) => void = () => {};
        const blocked = new Promise<string>((resolve) => { resolveFactory = resolve; });

        const inFlight = cache.getOrSet('idx-1:slow', () => blocked);
        await cache.deleteByPrefix('idx-1:');
        resolveFactory('stale');
        await inFlight;

        // A second caller must not be served the value the invalidated call produced.
        expect(cache.get('idx-1:slow')).toBeNull();
    });
});

describe('delete', () => {
    it('drops an in-flight factory so it cannot repopulate stale data', async () => {
        const cache = new CacheManager('test');
        let resolveFactory: (value: string) => void = () => {};
        const blocked = new Promise<string>((resolve) => { resolveFactory = resolve; });

        const inFlight = cache.getOrSet('key', () => blocked);
        await cache.delete('key');
        resolveFactory('stale');
        await inFlight;

        expect(cache.get('key')).toBeNull();
    });

    it('still returns the computed value to the caller that asked for it', async () => {
        const cache = new CacheManager('test');

        const inFlight = cache.getOrSet('key', async () => 'value');
        await cache.delete('key');

        // Invalidation suppresses the write-back, not the caller's own result.
        await expect(inFlight).resolves.toBe('value');
    });
});

describe('getOrSet failures', () => {
    // A factory that throws synchronously used to reach the finally clause while
    // the promise binding was still in its temporal dead zone: the real error was
    // replaced by "Cannot access 'promise' before initialization" and the pending
    // slot was never released, so the key returned that same ReferenceError for
    // the life of the process.
    it('surfaces the real error from a synchronously throwing factory', async () => {
        const cache = new CacheManager('test');

        await expect(cache.getOrSet('key', () => { throw new Error('boom'); }))
            .rejects.toThrow('boom');
    });

    it('retries after a synchronous throw rather than poisoning the key', async () => {
        const cache = new CacheManager('test');
        let attempts = 0;
        const factory = () => {
            attempts++;
            if (attempts === 1) throw new Error('boom');
            return Promise.resolve('value');
        };

        await expect(cache.getOrSet('key', factory)).rejects.toThrow('boom');
        await expect(cache.getOrSet('key', factory)).resolves.toBe('value');
        expect(attempts).toBe(2);
        expect(cache.getStats().pending).toBe(0);
    });

    it('retries after an async rejection and caches nothing', async () => {
        const cache = new CacheManager('test');

        await expect(cache.getOrSet('key', async () => { throw new Error('boom'); }))
            .rejects.toThrow('boom');

        expect(cache.get('key')).toBeNull();
        expect(cache.getStats().pending).toBe(0);
    });
});

describe('getOrSet', () => {
    it('collapses concurrent identical calls into one factory run', async () => {
        const cache = new CacheManager('test');
        let runs = 0;
        const factory = async () => { runs++; return 'value'; };

        const [a, b] = await Promise.all([
            cache.getOrSet('key', factory),
            cache.getOrSet('key', factory),
        ]);

        expect(runs).toBe(1);
        expect(a).toBe('value');
        expect(b).toBe('value');
        expect(cache.get('key')).toBe('value');
    });
});
