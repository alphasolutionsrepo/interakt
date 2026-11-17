// src/features/secrets/secrets.service.resolve.test.ts

/**
 * A secret a tool names gives no value both when the vault has no secret by that name and when
 * the stored value can't be decrypted (for example after the encryption key changed). Tools
 * that report a missing secret say "missing or can't be read" for this reason.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSecretByName } = vi.hoisted(() => ({ getSecretByName: vi.fn() }));
vi.mock('./secrets.repository', () => ({ getSecretByName }));

import { encrypt } from './secrets.encryption';
import { resolveSecret } from './secrets.service';

describe('resolveSecret', () => {
  beforeEach(() => { vi.stubEnv('SECRETS_ENCRYPTION_KEY', 'a'.repeat(64)); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('gives the value of a stored secret', async () => {
    getSecretByName.mockResolvedValueOnce({ name: 'orders_key', encryptedValue: encrypt('sk-orders') });
    await expect(resolveSecret('orders_key')).resolves.toBe('sk-orders');
  });

  it('gives no value when the vault has no secret by that name', async () => {
    getSecretByName.mockResolvedValueOnce(null);
    await expect(resolveSecret('gone')).resolves.toBeNull();
  });

  it.each([
    ['the encryption key changed after it was saved', () => encrypt('sk-orders'), 'b'.repeat(64)],
    ['the stored value is damaged', () => 'not-a-valid-ciphertext', 'a'.repeat(64)],
  ])('gives no value when the stored secret can\'t be decrypted: %s', async (_case, stored, keyAtRead) => {
    getSecretByName.mockResolvedValueOnce({ name: 'orders_key', encryptedValue: stored() });
    vi.stubEnv('SECRETS_ENCRYPTION_KEY', keyAtRead);
    await expect(resolveSecret('orders_key')).resolves.toBeNull();
  });
});
