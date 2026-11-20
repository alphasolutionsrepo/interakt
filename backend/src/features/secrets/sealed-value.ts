// src/features/secrets/sealed-value.ts

/**
 * Values encrypted where they are stored (an AI provider's API key), marked so a value
 * saved before encryption still reads as it was: "enc:v1:" + base64(iv + authTag + ciphertext).
 */

import { encrypt, decrypt } from './secrets.encryption';

const PREFIX = 'enc:v1:';

/** Encrypt a value for storage. Throws EncryptionKeyError when no key is set. */
export function seal(plaintext: string): string {
  return PREFIX + encrypt(plaintext);
}

/** Whether a stored value is encrypted (one saved earlier is plain text). */
export function isSealed(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

/**
 * The value as it was saved. Plain text saved before encryption comes back as it is.
 * Throws when an encrypted value can't be decrypted (no key, or a different one).
 */
export function unseal(stored: string): string {
  return isSealed(stored) ? decrypt(stored.slice(PREFIX.length)) : stored;
}
