// src/features/data-source/external-search/external-connection.missing-secret.test.ts

/**
 * The connection every search on an external data source uses: a missing secret fails naming
 * it (as a MissingSecretError, so a tool run doesn't retry it), and a source without
 * authentication ignores a leftover secret name.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/secrets/secrets.service', () => ({
  resolveSecret: vi.fn(async (name: string) => (name === 'es_key' ? 'key-123' : null)),
}));

import type { ExternalSearchIndexConfig } from '@/db/schema/data-sources.schema';
import { MissingSecretError } from '@/features/secrets/secret-template';

import { resolveExternalConnection } from './external-connection';

const config = (authType: string, secretRef?: string) => ({
  provider: 'elasticsearch',
  connection: {
    url: 'https://es.example.com',
    indexName: 'products',
    authType,
    ...(secretRef ? { credentials: { secretRef } } : {}),
  },
}) as unknown as ExternalSearchIndexConfig;

describe('connecting to an external data source for a search', () => {
  it('fails naming the missing secret', async () => {
    const connecting = resolveExternalConnection('Products', config('api_key', 'gone_key'));
    await expect(connecting).rejects.toBeInstanceOf(MissingSecretError);
    await expect(resolveExternalConnection('Products', config('api_key', 'gone_key'))).rejects.toThrow(
      'The secret "gone_key" used for this data source\'s connection is missing from the Secrets Vault or can\'t be read',
    );
  });

  it('uses the secret the vault gives', async () => {
    const connection = await resolveExternalConnection('Products', config('api_key', 'es_key'));
    expect(connection.apiKey).toBe('key-123');
  });

  it('ignores a leftover secret name on a source without authentication', async () => {
    const connection = await resolveExternalConnection('Products', config('none', 'gone_key'));
    expect(connection.apiKey).toBe('');
  });
});
