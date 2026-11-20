// src/features/secrets/secrets.no-encryption-key.test.ts

/**
 * Saving a secret when the server has no usable encryption key: refused with what to set,
 * nothing stored. Real handlers and service; the repository and auth are stubbed.
 */

import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  getSecretByName: vi.fn(async () => null),
  getSecretById: vi.fn(async () => ({ id: 's1', name: 'shop_api_key', encryptedValue: 'x', description: null })),
  createSecret: vi.fn(),
  updateSecret: vi.fn(),
}));
vi.mock('./secrets.repository', () => repository);
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));

import { handleCreateSecret, handleUpdateSecret } from './secrets.api.handlers';

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

const create = () => handleCreateSecret(new NextRequest('http://localhost/api/secrets', {
  method: 'POST',
  body: JSON.stringify({ name: 'shop_api_key', value: 'not-a-real-key' }),
}));
const update = () => handleUpdateSecret(
  new NextRequest('http://localhost/api/secrets/s1', { method: 'PUT', body: JSON.stringify({ value: 'not-a-real-key-2' }) }),
  { params: Promise.resolve({ id: 's1' }) }
);

describe('saving a secret without a usable encryption key', () => {
  it.each([
    ['not set', '', 'has no encryption key set'],
    ['not 64 hex characters', 'abc123', "isn't 64 hex characters"],
  ])('is refused when the key is %s, saying what to set, and nothing is stored', async (_label, key, message) => {
    vi.stubEnv('SECRETS_ENCRYPTION_KEY', key);
    for (const send of [create, update]) {
      const res = await send();
      expect(res.status).toBe(500);
      expect(await res.json()).toMatchObject({
        code: 'ENCRYPTION_KEY_NOT_SET',
        message: expect.stringContaining(message),
        hint: expect.stringContaining('SECRETS_ENCRYPTION_KEY'),
      });
    }
    expect(repository.createSecret).not.toHaveBeenCalled();
    expect(repository.updateSecret).not.toHaveBeenCalled();
  });
});
