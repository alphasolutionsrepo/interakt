// src/features/access/secret-references.ts

/**
 * Configs that send a vault secret somewhere (a tool, an MCP connection, an external data
 * source) can only be created or changed by a role that holds secrets:manage. Otherwise a
 * role without access to secrets could point a config at a secret and a host of its choosing
 * (or change the host of a config that already uses one) and receive the secret's value.
 *
 * A config uses secrets when it holds a {{secret:name}} template anywhere, or a non-empty
 * valueRef / secretRef / apiKeySecret field (the forms the executors resolve).
 */

import 'server-only';

import { AccessDeniedError } from './access-policy';
import { checkAccess } from './route-guard';

const SECRET_TEMPLATE = /\{\{secret:[a-z][a-z0-9_]*\}\}/;
const SECRET_FIELDS = new Set(['valueRef', 'secretRef', 'apiKeySecret']);

export function usesSecrets(value: unknown, depth = 0): boolean {
  if (depth > 20 || value === null || value === undefined) return false;
  if (typeof value === 'string') return SECRET_TEMPLATE.test(value);
  if (Array.isArray(value)) return value.some((v) => usesSecrets(v, depth + 1));
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(([k, v]) =>
      (SECRET_FIELDS.has(k) && typeof v === 'string' && v.trim() !== '') || usesSecrets(v, depth + 1),
    );
  }
  return false;
}

/**
 * Throws AccessDeniedError (403) when any of the given configs (the stored one and the new
 * one) uses a secret and the caller's role doesn't hold secrets:manage.
 */
export async function assertMayWriteSecretConfig(...configs: unknown[]): Promise<void> {
  if (!configs.some((c) => usesSecrets(c))) return;
  const { response } = await checkAccess('secrets:manage');
  if (response) {
    throw new AccessDeniedError('This uses a secret from the vault. Only a role that can manage secrets can set it up or change it.');
  }
}
