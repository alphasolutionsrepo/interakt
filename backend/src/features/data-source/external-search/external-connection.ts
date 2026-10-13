// src/features/data-source/external-search/external-connection.ts

/**
 * Resolve an external index data source's config into a connection.
 *
 * Kept free of the data-source service so that service can use it for health
 * checks and schema discovery without a circular import.
 */

import 'server-only';

import type { ExternalSearchIndexConfig } from '@/db/schema/data-sources.schema';
import { resolveSecret } from '@/features/secrets/secrets.service';
import type { ExternalConnection } from './external-search.types';

/** Data source config values (snake_case) → connector keys. */
const PROVIDER_KEYS: Record<ExternalSearchIndexConfig['provider'], string> = {
  elasticsearch: 'elasticsearch',
  azure_ai_search: 'azure-ai-search',
  sitecore_search: 'sitecore-search',
};

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

  // An unauthenticated source has nothing to resolve. Demanding a secret here made a
  // security-disabled Elasticsearch — a normal self-hosted deployment — impossible to query
  // without inventing a placeholder secret to satisfy validation.
  let apiKey = '';
  if (conn.authType !== 'none' && conn.credentials?.secretRef) {
    const resolved = await resolveSecret(conn.credentials.secretRef);
    if (!resolved) {
      throw new Error(
        `Failed to resolve secret "${conn.credentials.secretRef}" for data source "${name}". ` +
          'Check that a secret with exactly that name exists in the vault — this is the bare ' +
          'name, not a {{secret:...}} template.',
      );
    }
    apiKey = resolved;
  }

  return {
    provider: PROVIDER_KEYS[config.provider] ?? config.provider,
    endpoint: conn.url,
    indexName: conn.indexName,
    apiKey,
    authType: conn.authType,
    providerSettings: config.providerSettings ?? {},
  };
}
