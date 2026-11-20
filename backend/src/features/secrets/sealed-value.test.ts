// src/features/secrets/sealed-value.test.ts

import { afterEach, describe, expect, it, vi } from 'vitest';

import { isSealed, seal, unseal } from './sealed-value';
import { EncryptionKeyError } from './secrets.encryption';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

afterEach(() => { vi.unstubAllEnvs(); });

describe('sealed values', () => {
  it('stores an encrypted, marked value that reads back as it was saved', () => {
    vi.stubEnv('SECRETS_ENCRYPTION_KEY', KEY_A);
    const stored = seal('sk-live-123');
    expect(stored.startsWith('enc:v1:')).toBe(true);
    expect(stored).not.toContain('sk-live-123');
    expect(isSealed(stored)).toBe(true);
    expect(unseal(stored)).toBe('sk-live-123');
  });

  it('encrypts the same value differently each time', () => {
    vi.stubEnv('SECRETS_ENCRYPTION_KEY', KEY_A);
    expect(seal('same')).not.toBe(seal('same'));
  });

  it('reads a value saved before encryption as it is, without needing a key', () => {
    vi.stubEnv('SECRETS_ENCRYPTION_KEY', '');
    expect(isSealed('sk-plain')).toBe(false);
    expect(unseal('sk-plain')).toBe('sk-plain');
  });

  it('refuses to read a value encrypted with another key', () => {
    vi.stubEnv('SECRETS_ENCRYPTION_KEY', KEY_A);
    const stored = seal('sk-live-123');
    vi.stubEnv('SECRETS_ENCRYPTION_KEY', KEY_B);
    expect(() => unseal(stored)).toThrow();
  });

  it.each([
    ['not set', '', 'has no encryption key set'],
    ['not 64 hex characters', 'abc123', "isn't 64 hex characters"],
  ])('says what to set when the key is %s', (_label, key, message) => {
    vi.stubEnv('SECRETS_ENCRYPTION_KEY', key);
    let thrown: unknown;
    try { seal('x'); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(EncryptionKeyError);
    expect(thrown).toMatchObject({ code: 'ENCRYPTION_KEY_NOT_SET', status: 500, hint: expect.stringContaining('SECRETS_ENCRYPTION_KEY') });
    expect((thrown as Error).message).toContain(message);
  });
});
