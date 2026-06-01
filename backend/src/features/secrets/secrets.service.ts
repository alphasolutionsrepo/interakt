// src/features/secrets/secrets.service.ts

import { createLogger } from '@/shared/logger/logger';
import * as repository from './secrets.repository';
import type { SecretReference } from './secrets.repository';
import { encrypt, decrypt } from './secrets.encryption';
import type { CreateSecretDTO, UpdateSecretDTO, SecretMetadataResponse } from './secrets.types';

const logger = createLogger('secrets-service');

/**
 * Thrown when a secret cannot be deleted because tools, data sources, or MCP
 * connections still reference it. Carries the referrers so the API layer can
 * report a 409 with actionable detail.
 */
export class SecretInUseError extends Error {
  constructor(public readonly references: SecretReference[]) {
    const summary = references.map((r) => `${r.type} "${r.name}"`).join(', ');
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
// RUNTIME RESOLUTION (used by tool executors)
// ============================================================================

/**
 * Resolve a secret reference to its decrypted value.
 * Used at tool execution time to resolve {{secret:name}} references.
 */
export async function resolveSecret(name: string): Promise<string | null> {
  const secret = await repository.getSecretByName(name);
  if (!secret) return null;

  try {
    return decrypt(secret.encryptedValue);
  } catch (error) {
    logger.error('Failed to decrypt secret', error as Error, { name });
    return null;
  }
}
