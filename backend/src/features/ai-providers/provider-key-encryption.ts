// src/features/ai-providers/provider-key-encryption.ts

/**
 * Startup step: encrypts AI provider API keys saved before keys were encrypted, and
 * reports keys that can't be decrypted with the current SECRETS_ENCRYPTION_KEY.
 * Never throws: a failure is logged and startup carries on (plain keys still work).
 */

import { eq, and, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/db/index';
import { aiProviders } from '@/db/schema/ai-providers.schema';
import { isSealed, unseal } from '@/features/secrets/sealed-value';
import { encryptionKeyIsSet } from '@/features/secrets/secrets.encryption';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('ai-provider-key-encryption');

export interface ProviderKeyEncryptionResult {
  /** Plain keys encrypted now */
  encrypted: number;
  /** Plain keys left as they are (no encryption key set, or the write failed) */
  plain: number;
  /** Encrypted keys the current encryption key can't decrypt */
  unreadable: number;
}

export async function encryptStoredProviderKeys(): Promise<ProviderKeyEncryptionResult> {
  const result: ProviderKeyEncryptionResult = { encrypted: 0, plain: 0, unreadable: 0 };
  try {
    // The stored text as it is: a sql field skips the column's decryption
    const rows = await db
      .select({ id: aiProviders.id, providerKey: aiProviders.providerKey, stored: sql<string>`${aiProviders.apiKey}` })
      .from(aiProviders)
      // An empty key is no key: nothing to encrypt
      .where(and(isNotNull(aiProviders.apiKey), sql`${aiProviders.apiKey} <> ''`));

    const canEncrypt = encryptionKeyIsSet();
    const unreadable: string[] = [];
    for (const row of rows) {
      if (isSealed(row.stored)) {
        try {
          unseal(row.stored);
        } catch {
          unreadable.push(row.providerKey);
        }
        continue;
      }
      if (!canEncrypt) {
        result.plain++;
        continue;
      }
      try {
        // Only if unchanged since it was read (another replica, or an admin saving a new key)
        const updated = await db
          .update(aiProviders)
          .set({ apiKey: row.stored })
          .where(and(eq(aiProviders.id, row.id), sql`${aiProviders.apiKey} = ${row.stored}`))
          .returning({ id: aiProviders.id });
        result.encrypted += updated.length;
      } catch (error) {
        result.plain++;
        logger.error('Could not encrypt a saved AI provider key', error as Error, { providerKey: row.providerKey });
      }
    }
    result.unreadable = unreadable.length;

    if (result.encrypted > 0) logger.info('Encrypted saved AI provider keys', { count: result.encrypted });
    if (!canEncrypt && result.plain > 0) {
      logger.warn('AI provider keys are saved unencrypted: SECRETS_ENCRYPTION_KEY is not set', { count: result.plain });
    }
    if (unreadable.length > 0) {
      logger.error(
        'AI provider keys can\'t be decrypted with the current SECRETS_ENCRYPTION_KEY; enter them again on the AI Providers page',
        undefined,
        { providerKeys: unreadable }
      );
    }
  } catch (error) {
    logger.error('Could not check saved AI provider keys', error as Error);
  }
  return result;
}
