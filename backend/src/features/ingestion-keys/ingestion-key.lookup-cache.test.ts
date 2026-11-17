// src/features/ingestion-keys/ingestion-key.lookup-cache.test.ts

/**
 * The key lookup cache (KEY_LOOKUP_TTL_MS): a key looked up by its prefix, or "no such key", is
 * reused for a short time, so the same key sent again costs no database read; creating or
 * revoking a key drops its entry at once; a failed read is not cached; the secret is checked
 * every time. The database is an in-memory stand-in that counts reads; random bytes are fixed
 * so a test can name a key's prefix before the key exists.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('node:crypto', async (original) => ({
  ...(await original<typeof import('node:crypto')>()),
  randomBytes: (size: number) => Buffer.alloc(size, 0xab),
}));

const db = vi.hoisted(() => ({ rows: new Map<string, IngestionKeyWithIndexes>(), reads: 0, fails: false }));
vi.mock('./ingestion-key.repository', () => ({
  getByPrefix: async (prefix: string) => {
    db.reads++;
    if (db.fails) throw new Error('database down');
    return db.rows.get(prefix) ?? null;
  },
  create: async (input: { name: string; keyPrefix: string; keyHash: string; operations: string[]; searchIndexIds: string[] }) => {
    const row = { id: `id-${input.keyPrefix}`, ...input, expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: new Date(), createdBy: null } as unknown as IngestionKeyWithIndexes;
    db.rows.set(input.keyPrefix, row);
    return row;
  },
  revoke: async (id: string) => {
    const row = [...db.rows.values()].find((r) => r.id === id);
    if (!row) return null;
    const revoked = { ...row, revokedAt: new Date() } as IngestionKeyWithIndexes;
    db.rows.set(row.keyPrefix, revoked);
    return revoked;
  },
  touchLastUsed: async () => {},
}));

import {
  KEY_LOOKUP_TTL_MS,
  clearKeyLookupCache,
  createIngestionKey,
  generateKeyMaterial,
  identifyIngestionKey,
  isKeyLive,
  revokeIngestionKey,
} from './ingestion-key.service';
import type { IngestionKeyWithIndexes } from './ingestion-key.types';

beforeEach(async () => {
  db.rows.clear();
  db.reads = 0;
  db.fails = false;
  await clearKeyLookupCache();
});
afterEach(() => vi.useRealTimers());

const create = () => createIngestionKey({ name: 'k', operations: ['write'], searchIndexIds: ['index-a'] });

describe('the key lookup cache', () => {
  it('reads a key once for repeated requests, and checks the secret every time', async () => {
    const { plaintextKey } = await create();
    expect((await identifyIngestionKey(plaintextKey)).success).toBe(true);
    expect((await identifyIngestionKey(plaintextKey)).success).toBe(true);
    expect((await identifyIngestionKey(`${plaintextKey.slice(0, -4)}xxxx`)).success).toBe(false);
    expect(db.reads).toBe(1);
  });

  it('reads "no such key" once for the same wrong key, then again after the cache time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const wrong = 'ik_0badc0de_nope';
    for (let i = 0; i < 50; i++) expect((await identifyIngestionKey(wrong)).success).toBe(false);
    expect(db.reads).toBe(1);
    vi.setSystemTime(Date.now() + KEY_LOOKUP_TTL_MS + 1);
    await identifyIngestionKey(wrong);
    expect(db.reads).toBe(2);
  });

  it('reads once for many requests with the same key at the same time', async () => {
    const wrong = 'ik_0badc0de_nope';
    await Promise.all(Array.from({ length: 30 }, () => identifyIngestionKey(wrong)));
    expect(db.reads).toBe(1);
  });

  it('lets a new key in at once, even when its prefix was just cached as "no such key"', async () => {
    // Fixed random bytes: the next key's prefix is known before it exists
    const { plaintextKey } = generateKeyMaterial();
    expect((await identifyIngestionKey(plaintextKey)).success).toBe(false);
    const created = await create();
    expect(created.plaintextKey).toBe(plaintextKey);
    expect((await identifyIngestionKey(plaintextKey)).success).toBe(true);
  });

  it('refuses a revoked key at once, though it was cached as live', async () => {
    const { key, plaintextKey } = await create();
    const before = await identifyIngestionKey(plaintextKey);
    expect(before.success && isKeyLive(before.key)).toBe(true);
    await revokeIngestionKey(key.id, 'index-a');
    const after = await identifyIngestionKey(plaintextKey);
    expect(after.success && isKeyLive(after.key)).toBe(false);
  });

  it("doesn't cache a failed read: the next request reads again", async () => {
    db.fails = true;
    await expect(identifyIngestionKey('ik_0badc0de_nope')).rejects.toThrow('database down');
    db.fails = false;
    expect((await identifyIngestionKey('ik_0badc0de_nope')).success).toBe(false);
    expect(db.reads).toBe(2);
  });
});
