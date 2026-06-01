// src/features/secrets/secrets.types.ts

// Re-export validation types
export type {
  CreateSecretDTO,
  UpdateSecretDTO,
  ListSecretsQuery,
} from './secrets.validation';

// Re-export database types
export type {
  Secret,
  NewSecret,
} from '@/db/schema';

/**
 * Secret metadata — returned by list/get endpoints.
 * Never includes the actual secret value.
 */
export interface SecretMetadataResponse {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}
