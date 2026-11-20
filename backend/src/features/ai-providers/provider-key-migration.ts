// src/features/ai-providers/provider-key-migration.ts

/**
 * Startup step: moves API keys saved on provider rows (before keys moved to the Secrets Vault)
 * into the vault, as the provider's own secret ai_provider_<key>, and empties the row's key.
 * Each provider moves in one transaction, only if its key is unchanged since it was read, so
 * several server instances starting together move each key once. Never throws: a key that
 * can't be moved stays on its row and keeps working.
 */

import * as repository from './ai-providers.repository';
import { applyKeyChange } from './provider-key';
import { encryptionKeyIsSet } from '@/features/secrets/secrets.encryption';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('ai-provider-key-migration');

export interface ProviderKeyMoveResult {
  /** Keys moved into the vault now */
  moved: number;
  /** Keys left on their rows (no encryption key set, or the move failed) */
  left: number;
}

/** Rolls the provider's transaction back when its key changed after it was read */
class KeyChangedMeanwhile extends Error {}

export async function moveProviderKeysToVault(): Promise<ProviderKeyMoveResult> {
  const result: ProviderKeyMoveResult = { moved: 0, left: 0 };
  try {
    const providers = await repository.listProvidersWithKeyOnRow();
    if (providers.length === 0) return result;

    if (!encryptionKeyIsSet()) {
      result.left = providers.length;
      logger.warn('AI provider keys are saved on the provider, not in the Secrets Vault: SECRETS_ENCRYPTION_KEY is not set', { count: providers.length });
      return result;
    }

    for (const provider of providers) {
      try {
        await repository.inTransaction(async (tx) => {
          // A provider that already names a vault secret keeps it; the leftover key just goes
          const fields = provider.apiKeySecret
            ? { apiKey: null }
            : (await applyKeyChange({ kind: 'typed', value: provider.apiKey }, { ...provider, apiKeySecret: null, apiKeySecretManaged: false }, tx)).fields;
          if (!(await repository.updateKeyFieldsIfKeyUnchanged(provider.id, provider.apiKey, fields, tx))) {
            throw new KeyChangedMeanwhile();
          }
        });
        result.moved++;
      } catch (error) {
        if (error instanceof KeyChangedMeanwhile) continue;
        result.left++;
        logger.error('Could not move an AI provider key into the Secrets Vault', error as Error, { providerKey: provider.providerKey });
      }
    }
    if (result.moved > 0) logger.info('Moved AI provider keys into the Secrets Vault', { count: result.moved });
  } catch (error) {
    logger.error('Could not check AI provider keys saved on providers', error as Error);
  }
  return result;
}
