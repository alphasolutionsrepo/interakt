// src/features/ai-providers/ai-providers.unreadable-key.test.ts

/**
 * unreadableKeyError names a saved key the server can't decrypt. It reads the stored key only
 * for a provider set to use one that has none readable, and if that read fails the call goes
 * ahead as before (the check only names the cause).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/cache/cache-manager', () => ({
  CacheManager: class { getOrSet = (_k: string, fn: () => unknown) => fn(); delete = vi.fn(); deletePattern = vi.fn(); clear = vi.fn(); },
}));
vi.mock('./ai-providers.repository', () => ({ storedKeyIsUnreadable: vi.fn() }));

import * as repository from './ai-providers.repository';
import { unreadableKeyError } from './ai-providers.service';

const provider = { id: 'p1', providerKey: 'gw', displayName: 'Gateway', authType: 'api_key' as const, apiKey: null };
const stored = vi.mocked(repository.storedKeyIsUnreadable);

afterEach(() => { vi.clearAllMocks(); });

describe('unreadableKeyError', () => {
  it('names a saved key that cannot be decrypted', async () => {
    stored.mockResolvedValue(true);
    expect(await unreadableKeyError(provider)).toMatchObject({ code: 'PROVIDER_KEY_UNREADABLE', message: expect.stringContaining('"Gateway"') });
  });

  it('lets the call go ahead when the stored key cannot be checked', async () => {
    stored.mockRejectedValue(new Error('connection refused'));
    expect(await unreadableKeyError(provider)).toBeNull();
  });

  it.each([
    ['has a readable key', { apiKey: 'sk-1' }],
    ['uses no authentication', { authType: 'none' as const }],
  ])('does not read the stored key for a provider that %s', async (_label, change) => {
    expect(await unreadableKeyError({ ...provider, ...change })).toBeNull();
    expect(stored).not.toHaveBeenCalled();
  });
});
