// src/app/ai-providers/_lib/key-source.ts

/**
 * Where a provider's API key comes from in the form: typed (saved in the Secrets Vault as the
 * provider's own secret) or an existing vault secret chosen by name. What the form sends:
 * - typed: the key (empty keeps the saved one), never a secret name
 * - chosen: the secret's name when it is new, changed, or the base URL changed (a base URL on
 *   another server needs the secret chosen again); otherwise nothing, which keeps it
 */

import type { AIProviderResponse } from '@/features/ai-providers';

export type KeySource = 'typed' | 'secret';

type SavedKey = Pick<AIProviderResponse, 'apiKeySecret' | 'apiKeySecretManaged' | 'baseUrl'>;

/** A provider using a secret the admin chose opens on "vault secret"; otherwise on "typed". */
export function initialKeySource(provider?: SavedKey | null): KeySource {
  return provider?.apiKeySecret && !provider.apiKeySecretManaged ? 'secret' : 'typed';
}

/** The secret a provider uses that the admin chose (none for its own, made from a typed key). */
export function chosenSecretOf(provider?: SavedKey | null): string {
  return provider?.apiKeySecret && !provider.apiKeySecretManaged ? provider.apiKeySecret : '';
}

export function keyFieldsToSend(input: {
  source: KeySource;
  apiKey?: string | null;
  apiKeySecret?: string | null;
  baseUrl: string;
  provider?: SavedKey | null;
}): { apiKey?: string; apiKeySecret?: string } {
  if (input.source === 'typed') return { apiKey: input.apiKey ?? '' };
  const name = (input.apiKeySecret ?? '').trim();
  if (!name) return {};
  const unchanged = name === input.provider?.apiKeySecret && input.baseUrl === input.provider?.baseUrl;
  return unchanged ? {} : { apiKeySecret: name };
}

/** Where a provider's saved key is kept, for the card and table; null when it has none. */
export function keyLocation(provider: Pick<AIProviderResponse, 'hasApiKey' | 'apiKeySecret'>): string | null {
  if (!provider.hasApiKey) return null;
  return provider.apiKeySecret
    ? `Kept in the Secrets Vault as ${provider.apiKeySecret}`
    : 'Saved on the provider; it moves to the Secrets Vault when the server next starts with an encryption key set';
}

/**
 * Switching from a vault secret the admin chose to "a key entered here" needs a key: an empty
 * one would keep the chosen secret, which isn't what the form shows.
 */
export function typedKeyMissing(input: { source: KeySource; apiKey?: string | null; provider?: SavedKey | null }): boolean {
  return input.source === 'typed' && !(input.apiKey ?? '').trim() && !!chosenSecretOf(input.provider);
}
