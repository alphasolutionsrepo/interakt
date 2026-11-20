// src/features/ai-providers/provider-key.ts

/**
 * A provider's API key lives in the Secrets Vault; the provider row holds the secret's name
 * (apiKeySecret). withProviderKey is the one way to get the key: every call that sends it
 * (AI service, Test Connection, Discover Models, health check) loads the provider, then
 * passes it through here. A key saved before the vault held them (apiKey) is used as it is
 * until startup moves it into the vault.
 */

import type { AIProvider } from '@/db/schema/ai-providers.schema';
import { AIServiceError } from '@/features/ai-service/ai-service.types';
import { findSecretReferences, putSecretValue, readSecret, secretExists } from '@/features/secrets/secrets.service';
import type { DbExecutor } from '@/shared/db/executor';
import { ValidationError } from '@/shared/errors/app-error';

type KeyedProvider = Pick<AIProvider, 'id' | 'providerKey' | 'displayName' | 'apiKey' | 'apiKeySecret'>;

/**
 * The provider's key can't be had: its vault secret is gone, or can't be decrypted. A setup
 * problem: admins are told what to fix; visitors get the plain "unavailable" answer.
 */
export class ProviderKeyError extends AIServiceError {
  constructor(provider: KeyedProvider, reason: 'missing' | 'unreadable') {
    const secret = provider.apiKeySecret;
    super(
      reason === 'missing'
        ? `The API key for "${provider.displayName}" is the Secrets Vault secret "${secret}", which doesn't exist. Create it in the Secrets Vault, or enter the key again on the AI Providers page.`
        : `The API key for "${provider.displayName}" (Secrets Vault secret "${secret}") can't be decrypted with this server's encryption key. Restore the previous SECRETS_ENCRYPTION_KEY, or enter the key again on the AI Providers page.`,
      'PROVIDER_KEY_UNAVAILABLE',
      provider.id,
      provider.providerKey
    );
    // The name stays AIServiceError: error handling recognises AI service errors by it
  }
}

/** The provider with its API key read from the vault (apiKey), ready for a request. */
export async function withProviderKey<T extends KeyedProvider>(provider: T): Promise<T> {
  if (!provider.apiKeySecret) return provider;
  const read = await readSecret(provider.apiKeySecret);
  if (read.status !== 'found') throw new ProviderKeyError(provider, read.status);
  return { ...provider, apiKey: read.value };
}

// ============================================================================
// SAVING: a typed key goes to the vault; the provider keeps the secret's name
// ============================================================================

/** What a save does to the provider's key */
export type KeyChange =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'typed'; value: string }
  | { kind: 'chosen'; name: string };

/** A save gave both a key to store and a vault secret to use */
export class KeyAndSecretBothGivenError extends ValidationError {
  constructor() {
    super('Enter an API key or choose a vault secret, not both.', [
      { field: 'apiKeySecret', code: 'invalid_value', message: 'Enter an API key or choose a vault secret, not both.' },
    ]);
  }
}

/** The chosen vault secret doesn't exist */
export class UnknownKeySecretError extends ValidationError {
  constructor(name: string) {
    super(`There's no secret named "${name}" in the Secrets Vault.`, [
      { field: 'apiKeySecret', code: 'invalid_value', message: `There's no secret named "${name}" in the Secrets Vault.` },
    ]);
  }
}

/**
 * The key change a create or update asks for. No authentication removes the key; an empty
 * typed key keeps the saved one (the form sends one when nothing was typed); null removes it.
 */
export function keyChangeFrom(input: { authType?: string; apiKey?: string | null; apiKeySecret?: string | null }): KeyChange {
  if (input.authType === 'none') return { kind: 'remove' };
  const typed = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  const chosen = typeof input.apiKeySecret === 'string' ? input.apiKeySecret.trim() : '';
  if (typed && chosen) throw new KeyAndSecretBothGivenError();
  if (chosen) return { kind: 'chosen', name: chosen };
  if (typed) return { kind: 'typed', value: input.apiKey as string };
  if (input.apiKey === null || input.apiKeySecret === null) return { kind: 'remove' };
  return { kind: 'keep' };
}

/** The vault secret made for a provider from a typed key: ai_provider_<key>, hyphens as underscores */
export function managedSecretName(providerKey: string): string {
  return `ai_provider_${providerKey.replace(/-/g, '_')}`;
}

type SavedKeyFields = Pick<AIProvider, 'apiKey' | 'apiKeySecret' | 'apiKeySecretManaged'>;

/**
 * Applies a key change inside the save's transaction. Returns the provider fields to write
 * (none for "keep") and the provider's own secret it no longer uses, to delete once the
 * provider row is written if nothing else uses it.
 *
 * A typed key replaces the value of the provider's own secret, or makes one (the next free
 * name after ai_provider_<key>). When something else now uses the own secret (another
 * provider, a tool, a connection, a data source), it is left as it is and the typed key goes
 * to a new secret of this provider's. A chosen secret must exist. The key column the provider
 * used before keys moved to the vault is emptied on every change.
 */
export async function applyKeyChange(
  change: KeyChange,
  provider: { id?: string; providerKey: string; displayName: string } & Partial<SavedKeyFields>,
  tx: DbExecutor
): Promise<{ fields: Partial<SavedKeyFields>; noLongerUsed?: string }> {
  const ownSecret = provider.apiKeySecretManaged ? provider.apiKeySecret ?? undefined : undefined;
  switch (change.kind) {
    case 'keep':
      return { fields: {} };
    case 'remove':
      return { fields: { apiKey: null, apiKeySecret: null, apiKeySecretManaged: false }, noLongerUsed: ownSecret };
    case 'chosen': {
      if (!(await secretExists(change.name, tx))) throw new UnknownKeySecretError(change.name);
      // Choosing its own secret again (say, with a new base URL) keeps it the provider's own
      const stillOwn = ownSecret === change.name;
      return {
        fields: { apiKey: null, apiKeySecret: change.name, apiKeySecretManaged: stillOwn },
        noLongerUsed: stillOwn ? undefined : ownSecret,
      };
    }
    case 'typed': {
      // Overwrite the own secret only when this provider is its only user; a failed lookup fails the save
      const sharedOwn = ownSecret !== undefined
        && (await findSecretReferences(ownSecret, tx)).some((r) => !(r.type === 'ai_provider' && r.id === provider.id));
      const name = ownSecret && !sharedOwn ? ownSecret : await freeSecretName(managedSecretName(provider.providerKey), tx);
      await putSecretValue(name, change.value, { description: `API key for the AI provider "${provider.displayName}"`, executor: tx });
      return {
        fields: { apiKey: null, apiKeySecret: name, apiKeySecretManaged: true },
        noLongerUsed: sharedOwn ? ownSecret : undefined,
      };
    }
  }
}

/** The name, or the name with _2, _3... when the vault already has a secret by it */
async function freeSecretName(name: string, tx: DbExecutor): Promise<string> {
  if (!(await secretExists(name, tx))) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name}_${i}`;
    if (!(await secretExists(candidate, tx))) return candidate;
  }
}

/** Whether the provider has a key, in the vault or saved on it before keys moved there */
export function hasSavedKey(provider: Partial<SavedKeyFields>): boolean {
  return !!provider.apiKeySecret || !!provider.apiKey;
}
