// src/features/data-source/external-search/external-connection.ts

/**
 * Resolve an external index data source's config into a connection.
 *
 * Kept free of the data-source service so that service can use it for health
 * checks and schema discovery without a circular import.
 */

import 'server-only';

import type { ExternalSearchIndexConfig } from '@/db/schema/data-sources.schema';
import { missingSecretMessage } from '@/features/secrets/secret-template';
import { resolveSecret } from '@/features/secrets/secrets.service';
import type { ExternalConnection } from './external-search.types';

/** Data source config values (snake_case) → connector keys. */
const PROVIDER_KEYS: Record<ExternalSearchIndexConfig['provider'], string> = {
  elasticsearch: 'elasticsearch',
  azure_ai_search: 'azure-ai-search',
  sitecore_search: 'sitecore-search',
};

/**
 * The connection's secret, or '' when it uses none. An unauthenticated source has nothing to
 * resolve, so a leftover secret name is ignored. One rule for every request to the source.
 *
 * @throws Error naming the secret when the vault can't give it
 */
export async function resolveConnectionSecret(conn: ExternalSearchIndexConfig['connection']): Promise<string> {
  if (conn.authType === 'none' || !conn.credentials?.secretRef) return '';
  const resolved = await resolveSecret(conn.credentials.secretRef);
  if (!resolved) {
    throw new Error(missingSecretMessage(conn.credentials.secretRef, "for this data source's connection"));
  }
  return resolved;
}

/**
 * Resolve an external data source's config into a connection, decrypting its secret.
 *
 * @throws Error when the config is incomplete or the secret cannot be resolved
 */
export async function resolveExternalConnection(
  name: string,
  config: ExternalSearchIndexConfig,
): Promise<ExternalConnection> {
  const conn = config.connection;
  if (!conn?.url || !conn?.indexName) {
    throw new Error(`Data source "${name}" has incomplete connection config`);
  }

  const apiKey = await resolveConnectionSecret(conn);

  return {
    provider: PROVIDER_KEYS[config.provider] ?? config.provider,
    endpoint: conn.url,
    indexName: conn.indexName,
    apiKey,
    authType: conn.authType,
    providerSettings: config.providerSettings ?? {},
  };
}
