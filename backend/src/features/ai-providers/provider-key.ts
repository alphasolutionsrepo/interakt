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
import { readSecret } from '@/features/secrets/secrets.service';

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
