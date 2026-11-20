// src/features/secrets/secrets.encryption.ts

/**
 * AES-256-GCM encryption utilities for secrets vault.
 *
 * Format: base64(iv + authTag + ciphertext)
 * - IV: 12 bytes (random per encryption)
 * - Auth Tag: 16 bytes
 * - Ciphertext: variable length
 */

import crypto from 'crypto';

import { AppError } from '../../shared/errors/app-error';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const KEY_HINT = 'Set SECRETS_ENCRYPTION_KEY on the server to 64 hex characters (generate one with: openssl rand -hex 32), then restart.';

/**
 * The server can't encrypt or decrypt: SECRETS_ENCRYPTION_KEY is missing or malformed.
 * A setup problem on our side, so the admin sees what to set instead of a generic error.
 */
export class EncryptionKeyError extends AppError {
  constructor(message: string) {
    super(message, { code: 'ENCRYPTION_KEY_NOT_SET', status: 500, hint: KEY_HINT, ourSide: true });
    this.name = 'EncryptionKeyError';
  }
}

function getMasterKey(): Buffer {
  const key = process.env.SECRETS_ENCRYPTION_KEY;
  if (!key) {
    throw new EncryptionKeyError('The server has no encryption key set, so secrets and API keys can\'t be saved or read.');
  }
  // Accept hex-encoded 32-byte key
  const keyBuffer = Buffer.from(key, 'hex');
  if (keyBuffer.length !== 32) {
    throw new EncryptionKeyError('The server\'s encryption key isn\'t 64 hex characters, so secrets and API keys can\'t be saved or read.');
  }
  return keyBuffer;
}

/** Whether a valid SECRETS_ENCRYPTION_KEY is set (nothing is thrown). */
export function encryptionKeyIsSet(): boolean {
  try {
    getMasterKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt a plaintext value.
 * Returns a base64 string containing: iv + authTag + ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Pack: iv + authTag + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt a base64-encoded encrypted value.
 * Expects format: base64(iv + authTag + ciphertext)
 */
export function decrypt(encryptedBase64: string): string {
  const key = getMasterKey();
  const packed = Buffer.from(encryptedBase64, 'base64');

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted data: too short');
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
