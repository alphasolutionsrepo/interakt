// src/features/secrets/secrets.service.ts

import { createLogger } from '@/shared/logger/logger';
import * as repository from './secrets.repository';
import type { SecretReference } from './secrets.repository';
import { encrypt, decrypt } from './secrets.encryption';
import type { CreateSecretDTO, UpdateSecretDTO, SecretMetadataResponse } from './secrets.types';
import type { DbExecutor } from '@/shared/db/executor';

const logger = createLogger('secrets-service');

/**
 * Thrown when a secret cannot be deleted because tools, data sources, or MCP
 * connections still reference it. Carries the referrers so the API layer can
 * report a 409 with actionable detail.
 */
const REFERENCE_LABELS: Record<SecretReference['type'], string> = {
  tool: 'tool',
  data_source: 'data source',
  mcp_connection: 'MCP connection',
  ai_provider: 'AI provider',
};

export class SecretInUseError extends Error {
  constructor(public readonly references: SecretReference[]) {
    const summary = references.map((r) => `${REFERENCE_LABELS[r.type]} "${r.name}"`).join(', ');
    super(`Secret is still referenced by ${references.length} config(s): ${summary}. Remove the references before deleting.`);
    this.name = 'SecretInUseError';
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function toMetadataResponse(row: {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SecretMetadataResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

export async function createSecret(input: CreateSecretDTO, userId?: string): Promise<SecretMetadataResponse> {
  // Check uniqueness
  const existing = await repository.getSecretByName(input.name);
  if (existing) {
    throw new Error(`Secret with name "${input.name}" already exists`);
  }

  const encryptedValue = encrypt(input.value);
  const created = await repository.createSecret({
    name: input.name,
    encryptedValue,
    description: input.description,
    createdBy: userId,
  });

  logger.info('Created secret', { secretId: created.id, name: created.name, userId });

  return toMetadataResponse(created);
}

export async function getSecretMetadata(id: string): Promise<SecretMetadataResponse | null> {
  const secret = await repository.getSecretById(id);
  if (!secret) return null;
  return toMetadataResponse(secret);
}

export async function listSecrets(search?: string): Promise<SecretMetadataResponse[]> {
  const rows = await repository.listSecrets(search);
  return rows.map(toMetadataResponse);
}

export async function updateSecret(id: string, input: UpdateSecretDTO, userId?: string): Promise<SecretMetadataResponse | null> {
  const existing = await repository.getSecretById(id);
  if (!existing) return null;

  const updateData: { encryptedValue?: string; description?: string; updatedBy?: string } = {
    updatedBy: userId,
  };

  if (input.value) {
    updateData.encryptedValue = encrypt(input.value);
  }
  if (input.description !== undefined) {
    updateData.description = input.description;
  }

  const updated = await repository.updateSecret(id, updateData);
  if (!updated) return null;

  logger.info('Updated secret', { secretId: id, name: existing.name, userId });

  return toMetadataResponse(updated);
}

export async function deleteSecret(id: string, userId?: string): Promise<boolean> {
  const existing = await repository.getSecretById(id);
  if (!existing) return false;

  // Refuse to orphan a tool/data-source/MCP config that still resolves this secret.
  const references = await repository.findSecretReferences(existing.name);
  if (references.length > 0) {
    throw new SecretInUseError(references);
  }

  const deleted = await repository.deleteSecret(id);
  if (!deleted) return false;

  logger.info('Deleted secret', { secretId: id, name: existing.name, userId });
  return true;
}

// ============================================================================
// SECRETS OTHER FEATURES KEEP FOR THEIR CONFIG (an AI provider's key)
// ============================================================================

/** Whether the vault has a secret by this name. */
export async function secretExists(name: string, executor?: DbExecutor): Promise<boolean> {
  return (await repository.getSecretByName(name, executor)) !== null;
}

/**
 * Store a value under a name: the secret's value is replaced when it exists, created
 * otherwise. Encrypts first, so with no usable SECRETS_ENCRYPTION_KEY nothing is written
 * (EncryptionKeyError). Runs in the caller's transaction when given one.
 */
export async function putSecretValue(
  name: string,
  value: string,
  options: { description?: string; executor?: DbExecutor } = {}
): Promise<void> {
  const encryptedValue = encrypt(value);
  const existing = await repository.getSecretByName(name, options.executor);
  if (existing) {
    await repository.updateSecret(existing.id, { encryptedValue }, options.executor);
    logger.info('Updated secret value', { secretId: existing.id, name });
  } else {
    const created = await repository.createSecret({ name, encryptedValue, description: options.description }, options.executor);
    logger.info('Created secret', { secretId: created.id, name });
  }
}

/** Every config that names the secret (tools, data sources, MCP connections, AI providers); throws when the lookup fails */
export async function findSecretReferences(name: string, executor?: DbExecutor): Promise<SecretReference[]> {
  return repository.findSecretReferences(name, executor);
}

/**
 * Delete a secret nothing uses any more (no tool, data source, MCP connection or AI provider
 * names it). Returns whether it was deleted. Runs in the caller's transaction when given one,
 * so references changed in that transaction count.
 */
export async function deleteSecretIfUnused(name: string, executor?: DbExecutor): Promise<boolean> {
  const existing = await repository.getSecretByName(name, executor);
  if (!existing) return false;
  if ((await repository.findSecretReferences(name, executor)).length > 0) return false;
  await repository.deleteSecret(existing.id, executor);
  logger.info('Deleted unused secret', { secretId: existing.id, name });
  return true;
}

// ============================================================================
// RUNTIME RESOLUTION (used by tool executors)
// ============================================================================

/** A secret's value, or why there is none: no secret by that name, or one this server can't decrypt */
export type SecretRead =
  | { status: 'found'; value: string }
  | { status: 'missing' }
  | { status: 'unreadable' };

/**
 * Read a secret's value by name, saying why when there is none. "unreadable" covers a value
 * encrypted with another SECRETS_ENCRYPTION_KEY, a damaged value, and no key set.
 */
export async function readSecret(name: string): Promise<SecretRead> {
  const secret = await repository.getSecretByName(name);
  if (!secret) return { status: 'missing' };

  try {
    return { status: 'found', value: decrypt(secret.encryptedValue) };
  } catch (error) {
    logger.error('Failed to decrypt secret', error as Error, { name });
    return { status: 'unreadable' };
  }
}

/**
 * Resolve a secret reference to its decrypted value, or null when there is none.
 * Used at tool execution time to resolve {{secret:name}} references.
 */
export async function resolveSecret(name: string): Promise<string | null> {
  const read = await readSecret(name);
  return read.status === 'found' ? read.value : null;
}
