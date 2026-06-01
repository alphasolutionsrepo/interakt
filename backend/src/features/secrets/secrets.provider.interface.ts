// src/features/secrets/secrets.provider.interface.ts

/**
 * Secrets Provider Interface
 *
 * Abstraction layer for secret storage. The default implementation uses
 * the database with AES-256-GCM encryption. This interface can be
 * implemented by cloud-based vaults (AWS Secrets Manager, Azure Key Vault)
 * by swapping the provider in configuration.
 */

export interface SecretMetadata {
  name: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SecretsProvider {
  /**
   * Get a decrypted secret value by name.
   * Returns null if the secret does not exist.
   */
  getSecret(name: string): Promise<string | null>;

  /**
   * Store a secret. Creates if new, updates if exists.
   */
  setSecret(name: string, value: string, description?: string): Promise<void>;

  /**
   * Delete a secret by name.
   */
  deleteSecret(name: string): Promise<void>;

  /**
   * List all secrets (metadata only — never returns values).
   */
  listSecrets(): Promise<SecretMetadata[]>;

  /**
   * Check if a secret exists by name.
   */
  hasSecret(name: string): Promise<boolean>;
}
