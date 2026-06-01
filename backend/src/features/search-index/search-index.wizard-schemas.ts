// src/features/search-index/search-index.wizard-schemas.ts

/**
 * Search Index Creation Wizard - Step Validation Schemas
 * 
 * These schemas are used ONLY by the multi-step wizard for step-by-step validation.
 * They compose from the base field schemas defined in search-index.validation.ts
 * 
 * The main createSearchIndexSchema in search-index.validation.ts remains the 
 * SINGLE SOURCE OF TRUTH for the complete DTO and is used by:
 * - API handlers for request validation
 * - Service layer for business logic validation
 * 
 * These wizard schemas extract subsets for UI step validation only.
 */

import { z } from 'zod';
import {
    INDEX_NAME_REGEX,
    INDEX_NAME_MAX_LENGTH,
    INDEX_NAME_MIN_LENGTH,
    SEARCH_INDEX_DEFAULTS,
} from '@/shared/constants/search-index.constants';
import {
    searchTypeSchema,
    indexingStrategySchema,
    vectorSimilaritySchema,
} from './search-index.validation';

// ============================================================================
// STEP 1: BASIC INFO SCHEMA
// ============================================================================

/**
 * Step 1 validates basic information:
 * - Display name (required)
 * - Index name (required, must be valid ES index name)
 * - Data template selection (required)
 * - Search type selection (required)
 * - Description (optional)
 */
export const wizardStep1Schema = z.object({
    displayName: z.string()
        .min(1, 'Display name is required')
        .max(255, 'Display name too long'),

    name: z.string()
        .min(INDEX_NAME_MIN_LENGTH, `Name must be at least ${INDEX_NAME_MIN_LENGTH} characters`)
        .max(INDEX_NAME_MAX_LENGTH, `Name cannot exceed ${INDEX_NAME_MAX_LENGTH} characters`)
        .regex(INDEX_NAME_REGEX, 'Name must be lowercase, start with a letter, and contain only letters, numbers, hyphens, and underscores'),

    description: z.string().max(1000).optional(),

    searchType: searchTypeSchema,

    // Search provider selection (set at creation, immutable)
    searchProvider: z.string().default('elasticsearch'),
});

export type WizardStep1Data = z.infer<typeof wizardStep1Schema>;

// ============================================================================
// STEP 2: SEARCH SETTINGS SCHEMA
// ============================================================================

/**
 * Step 2 validates search configuration:
 * - Indexing strategy (required, has default)
 * - Language (required, has default)
 * - Synonyms (optional array)
 * - Stop words (optional array)
 * - Advanced ES settings (optional, have defaults)
 */
export const wizardStep2Schema = z.object({
    indexingStrategy: indexingStrategySchema.default('on_upload'),
    language: z.string().max(20).default('english'),
    synonyms: z.array(z.string()).default([]),
    stopWords: z.array(z.string()).default([]),

    // Provider-specific settings (dynamic, rendered by provider UI component)
    providerSettings: z.record(z.unknown()).default({}),

    // DEPRECATED ES settings (kept for backward compat)
    numberOfShards: z.number().int().min(1).max(100).default(SEARCH_INDEX_DEFAULTS.numberOfShards).optional(),
    numberOfReplicas: z.number().int().min(0).max(10).default(SEARCH_INDEX_DEFAULTS.numberOfReplicas).optional(),
    refreshInterval: z.string().max(20).default(SEARCH_INDEX_DEFAULTS.refreshInterval).optional(),
});

export type WizardStep2Data = z.infer<typeof wizardStep2Schema>;

// ============================================================================
// STEP 3: AI CONFIGURATION SCHEMA
// ============================================================================

/**
 * Step 3 validates AI configuration (only for semantic/hybrid search):
 * - AI Provider (required for semantic/hybrid)
 * - AI Model (required for semantic/hybrid)
 * - Embedding dimensions (auto-set from model)
 * - Vector similarity metric (has default)
 * - RRF settings for hybrid (have defaults)
 */
export const wizardStep3Schema = z.object({
    aiProviderId: z.string().uuid('Please select an AI provider'),
    aiModelId: z.number({
        required_error: 'Please select an embedding model',
        invalid_type_error: 'Please select an embedding model',
    }).int().positive('Please select an embedding model'),
    embeddingDimensions: z.number().int().positive().max(4096),
    vectorSimilarity: vectorSimilaritySchema.default('cosine'),
    rrfRankConstant: z.number().int().min(1).max(1000).default(SEARCH_INDEX_DEFAULTS.rrfRankConstant),
    rrfWindowSize: z.number().int().min(10).max(10000).default(SEARCH_INDEX_DEFAULTS.rrfWindowSize),
});

export type WizardStep3Data = z.infer<typeof wizardStep3Schema>;

// ============================================================================
// STEP FIELD DEFINITIONS (for reference)
// ============================================================================

/**
 * Fields belonging to each step - useful for form state management
 */
export const WIZARD_STEP_FIELDS = {
    1: ['displayName', 'name', 'description', 'searchType', 'searchProvider'] as const,
    2: ['indexingStrategy', 'language', 'synonyms', 'stopWords', 'providerSettings', 'numberOfShards', 'numberOfReplicas', 'refreshInterval'] as const,
    3: ['aiProviderId', 'aiModelId', 'embeddingDimensions', 'vectorSimilarity', 'rrfRankConstant', 'rrfWindowSize'] as const,
};

// ============================================================================
// COMPLETE WIZARD DATA TYPE
// ============================================================================

/**
 * Combined type for all wizard data
 * This should match CreateSearchIndexDTO structure
 */
export type WizardFormData = WizardStep1Data & WizardStep2Data & Partial<WizardStep3Data> & {
    fieldMappings: []; // Always empty during creation
};

// ============================================================================
// DEFAULT VALUES
// ============================================================================

/**
 * Default values for the wizard form
 */
export const WIZARD_DEFAULT_VALUES: WizardFormData = {
    // Step 1
    displayName: '',
    name: '',
    description: '',
    searchType: 'lexical',
    searchProvider: 'elasticsearch',

    // Step 2
    indexingStrategy: 'on_upload',
    language: 'english',
    synonyms: [],
    stopWords: [],
    providerSettings: {},

    // Step 3 (optional - only for semantic/hybrid)
    aiProviderId: undefined,
    aiModelId: undefined,
    embeddingDimensions: undefined,
    vectorSimilarity: 'cosine',
    rrfRankConstant: SEARCH_INDEX_DEFAULTS.rrfRankConstant,
    rrfWindowSize: SEARCH_INDEX_DEFAULTS.rrfWindowSize,

    // Field mappings (always empty during wizard)
    fieldMappings: [],
};