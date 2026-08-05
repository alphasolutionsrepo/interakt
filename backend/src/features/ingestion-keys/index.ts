// src/features/ingestion-keys/index.ts

/**
 * Ingestion Keys Feature - Public API
 *
 * Server-to-server credentials for document write/delete. A different credential
 * class from search experience access tokens, which are public by design and
 * read-only.
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
    IngestionKey,
    IngestionOperation,
    IngestionKeyWithIndexes,
    IngestionKeySummary,
    CreatedIngestionKey,
    IngestionAuthFailure,
    IngestionAuthResult,
} from './ingestion-key.types';

// ============================================================================
// VALIDATION
// ============================================================================

export {
    ingestionOperationSchema,
    createIngestionKeyRequestSchema,
    ingestionKeyIdParamSchema,
} from './ingestion-key.validation';

export type {
    CreateIngestionKeyRequest,
    IngestionKeyIdParam,
} from './ingestion-key.validation';

// ============================================================================
// SERVICE
// ============================================================================

export {
    createIngestionKey,
    listIngestionKeys,
    revokeIngestionKey,
    verifyIngestionKey,
    parseKey,
    toSummary,
} from './ingestion-key.service';

// ============================================================================
// MIDDLEWARE
// ============================================================================

export {
    authenticateIngestionKey,
    hasBearerCredentials,
    ingestionRateLimitKey,
} from './ingestion-key.middleware';

// ============================================================================
// API HANDLERS
// ============================================================================

export {
    handleListIngestionKeys,
    handleCreateIngestionKey,
    handleRevokeIngestionKey,
} from './ingestion-key.api.handlers';
