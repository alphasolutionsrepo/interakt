// db/schema/encrypted-text.ts

/**
 * A text column encrypted at rest. Writes are encrypted with SECRETS_ENCRYPTION_KEY
 * (no key: the write fails with EncryptionKeyError); reads decrypt, so callers see the
 * value as it was saved. Plain text saved before encryption reads as it is until the
 * startup step encrypts it (encryptStoredProviderKeys).
 *
 * A value that can't be decrypted (the key was changed) reads as null, so the rest of
 * the row still loads and the admin can enter the value again; startup logs it.
 *
 * Relative imports: drizzle-kit loads this file without the app's path aliases.
 */

import { customType } from 'drizzle-orm/pg-core';

import { seal, unseal } from '../../src/features/secrets/sealed-value';

export const encryptedText = customType<{ data: string; driverData: string }>({
  dataType: () => 'text',
  toDriver: (value) => seal(value),
  fromDriver: (stored) => {
    try {
      return unseal(stored);
    } catch {
      return null as unknown as string;
    }
  },
});
