// src/features/ai-providers/ai-providers.validation.ts

/**
 * AI Providers Feature - Validation Schemas
 * Zod schemas for request validation
 * 
 * SINGLE SOURCE OF TRUTH: All DTOs are inferred from these schemas
 * 
 * NOTE: The enum arrays (AI_MODEL_TYPES, etc.) are the source of truth.
 * When modifying, also update: db/schema/enums.schema.ts
 */

import { z } from 'zod';

// ============================================================================
// ENUM VALUES (Source of Truth)
// These match the database enums in db/schema/enums.schema.ts
// ============================================================================

/**
 * AI Model Types
 * - text: General text generation/completion
 * - embedding: Vector embeddings for semantic search
 * - chat: Conversational models
 * - vision: Image understanding models (future)
 */
export const AI_MODEL_TYPES = ['text', 'embedding', 'chat', 'vision'] as const;

/**
 * AI Authentication Types
 * - api_key: Requires an API key
 * - none: No authentication (e.g., local Ollama)
 * - oauth: OAuth-based auth (future)
 */
export const AI_AUTH_TYPES = ['api_key', 'none', 'oauth'] as const;

/**
 * AI Provider Deployment Types
 * - cloud: External cloud service (OpenAI, Anthropic)
 * - local: Runs on local/client infrastructure (Ollama)
 */
export const AI_PROVIDER_TYPES = ['cloud', 'local'] as const;

/**
 * Default Purpose Types
 * What system defaults can be configured for
 */
export const AI_DEFAULT_PURPOSES = ['text_generation', 'embedding', 'chat'] as const;

// ============================================================================
// BASE SCHEMAS (Enums)
// ============================================================================

export const modelTypeSchema = z.enum(AI_MODEL_TYPES);
export const authTypeSchema = z.enum(AI_AUTH_TYPES);
export const providerTypeSchema = z.enum(AI_PROVIDER_TYPES);
export const defaultPurposeSchema = z.enum(AI_DEFAULT_PURPOSES);

// Inferred types from Zod schemas
export type AIModelType = z.infer<typeof modelTypeSchema>;
export type AIAuthType = z.infer<typeof authTypeSchema>;
export type AIProviderType = z.infer<typeof providerTypeSchema>;
export type AIDefaultPurpose = z.infer<typeof defaultPurposeSchema>;

// ============================================================================
// PROVIDER SETTINGS SCHEMA
// ============================================================================

export const providerSettingsSchema = z.object({
  // OpenAI specific
  organizationId: z.string().optional(),
  
  // Ollama specific
  keepAlive: z.string().optional(),
  
  // Common
  timeout: z.number().positive().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
}).passthrough(); // Allow additional properties

// ============================================================================
// MODEL CAPABILITIES SCHEMA
// ============================================================================

export const modelCapabilitiesSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  contextWindow: z.number().int().positive().optional(),
  supportsStreaming: z.boolean().optional(),
  supportsJsonMode: z.boolean().optional(),
  supportsFunctionCalling: z.boolean().optional(),
  supportsVision: z.boolean().optional(),
  // OpenAI-specific: newer models (o1, o3, etc.) use max_completion_tokens
  usesCompletionTokens: z.boolean().optional(),
  // OpenAI-specific: reasoning models don't support temperature
  noTemperature: z.boolean().optional(),
}).passthrough();

// ============================================================================
// PROVIDER SCHEMAS
// ============================================================================

/**
 * Schema for creating a new AI provider
 */
export const createAIProviderSchema = z.object({
  providerKey: z.string()
    .min(1, 'Provider key is required')
    .max(50, 'Provider key too long')
    .regex(/^[a-z][a-z0-9_-]*$/, 'Provider key must be lowercase alphanumeric with underscores/hyphens'),
  
  displayName: z.string()
    .min(1, 'Display name is required')
    .max(100, 'Display name too long'),
  
  description: z.string()
    .max(1000, 'Description too long')
    .optional(),
  
  providerType: providerTypeSchema,
  authType: authTypeSchema,
  
  baseUrl: z.string()
    .url('Must be a valid URL')
    .max(500, 'URL too long'),
  
  apiKey: z.string()
    .max(500, 'API key too long')
    .optional()
    .nullable(),
  
  isEnabled: z.boolean().default(false),
  
  settings: providerSettingsSchema.optional().default({}),
});

export type CreateAIProviderInput = z.infer<typeof createAIProviderSchema>;

/**
 * Schema for updating an AI provider
 */
export const updateAIProviderSchema = z.object({
  displayName: z.string()
    .min(1, 'Display name is required')
    .max(100, 'Display name too long')
    .optional(),
  
  description: z.string()
    .max(1000, 'Description too long')
    .optional()
    .nullable(),
  
  baseUrl: z.string()
    .url('Must be a valid URL')
    .max(500, 'URL too long')
    .optional(),
  
  apiKey: z.string()
    .max(500, 'API key too long')
    .optional()
    .nullable(),
  
  isEnabled: z.boolean().optional(),
  
  settings: providerSettingsSchema.optional(),
});

export type UpdateAIProviderInput = z.infer<typeof updateAIProviderSchema>;

// ============================================================================
// MODEL SCHEMAS
// ============================================================================

/**
 * Schema for creating a new AI model
 */
export const createAIModelSchema = z.object({
  providerId: z.string().uuid('Invalid provider ID'),

  modelKey: z.string()
    .min(1, 'Model key is required')
    .max(100, 'Model key too long'),

  displayName: z.string()
    .min(1, 'Display name is required')
    .max(150, 'Display name too long'),

  description: z.string()
    .max(500, 'Description too long')
    .optional()
    .nullable(),

  modelType: modelTypeSchema,

  dimensions: z.number()
    .int()
    .positive()
    .max(10000, 'Dimensions value too large')
    .optional()
    .nullable(),

  capabilities: modelCapabilitiesSchema.optional().default({}),

  isAvailable: z.boolean().default(true),

  isDiscovered: z.boolean().default(false),

  sortOrder: z.number().int().min(0).default(0),

  // Pricing fields for cost estimation
  inputCostPerMillionTokens: z.number()
    .min(0, 'Cost cannot be negative')
    .max(1000, 'Cost seems too high')
    .optional()
    .nullable(),

  outputCostPerMillionTokens: z.number()
    .min(0, 'Cost cannot be negative')
    .max(1000, 'Cost seems too high')
    .optional()
    .nullable(),
});

export type CreateAIModelInput = z.infer<typeof createAIModelSchema>;

/**
 * Schema for updating an AI model
 */
export const updateAIModelSchema = z.object({
  displayName: z.string()
    .min(1, 'Display name is required')
    .max(150, 'Display name too long')
    .optional(),

  description: z.string()
    .max(500, 'Description too long')
    .optional()
    .nullable(),

  dimensions: z.number()
    .int()
    .positive()
    .max(10000, 'Dimensions value too large')
    .optional()
    .nullable(),

  capabilities: modelCapabilitiesSchema.optional(),

  isAvailable: z.boolean().optional(),

  sortOrder: z.number().int().min(0).optional(),

  // Pricing fields for cost estimation
  inputCostPerMillionTokens: z.number()
    .min(0, 'Cost cannot be negative')
    .max(1000, 'Cost seems too high')
    .optional()
    .nullable(),

  outputCostPerMillionTokens: z.number()
    .min(0, 'Cost cannot be negative')
    .max(1000, 'Cost seems too high')
    .optional()
    .nullable(),
});

export type UpdateAIModelInput = z.infer<typeof updateAIModelSchema>;

// ============================================================================
// SYSTEM DEFAULTS SCHEMAS
// ============================================================================

/**
 * Schema for updating system defaults
 * For each purpose, both provider and model must be set together, or both must be null/undefined
 */
export const updateSystemDefaultsSchema = z.object({
  // Text generation defaults
  defaultTextProviderId: z.string().uuid().optional().nullable(),
  defaultTextModelId: z.number().int().positive().optional().nullable(),
  
  // Embedding defaults
  defaultEmbeddingProviderId: z.string().uuid().optional().nullable(),
  defaultEmbeddingModelId: z.number().int().positive().optional().nullable(),
  
  // Chat defaults
  defaultChatProviderId: z.string().uuid().optional().nullable(),
  defaultChatModelId: z.number().int().positive().optional().nullable(),
}).refine(
  (data) => {
    // Helper to check if both are set or both are null/undefined
    const bothOrNeither = (providerId: string | null | undefined, modelId: number | null | undefined) => {
      const hasProvider = providerId !== null && providerId !== undefined;
      const hasModel = modelId !== null && modelId !== undefined;
      return hasProvider === hasModel;
    };
    
    return (
      bothOrNeither(data.defaultTextProviderId, data.defaultTextModelId) &&
      bothOrNeither(data.defaultEmbeddingProviderId, data.defaultEmbeddingModelId) &&
      bothOrNeither(data.defaultChatProviderId, data.defaultChatModelId)
    );
  },
  {
    message: 'For each purpose, both provider and model must be selected together, or both must be cleared',
  }
);

export type UpdateSystemDefaultsInput = z.infer<typeof updateSystemDefaultsSchema>;

/**
 * Schema for setting a single default (body only - purpose comes from URL param)
 * Both providerId and modelId must be set together, or both must be null
 */
export const setDefaultBodySchema = z.object({
  providerId: z.string().uuid().nullable(),
  modelId: z.number().int().positive().nullable(),
}).refine(
  (data) => {
    // Both must be set or both must be null
    const hasProvider = data.providerId !== null;
    const hasModel = data.modelId !== null;
    return hasProvider === hasModel;
  },
  {
    message: 'Both provider and model must be selected together, or both must be cleared',
  }
);

export type SetDefaultBodyInput = z.infer<typeof setDefaultBodySchema>;

/**
 * Full schema for setting a single default (includes purpose)
 * Both providerId and modelId must be set together, or both must be null
 */
export const setDefaultSchema = z.object({
  purpose: defaultPurposeSchema,
  providerId: z.string().uuid().nullable(),
  modelId: z.number().int().positive().nullable(),
}).refine(
  (data) => {
    // Both must be set or both must be null
    const hasProvider = data.providerId !== null;
    const hasModel = data.modelId !== null;
    return hasProvider === hasModel;
  },
  {
    message: 'Both provider and model must be selected together, or both must be cleared',
  }
);

export type SetDefaultInput = z.infer<typeof setDefaultSchema>;

// ============================================================================
// QUERY SCHEMAS
// ============================================================================

/**
 * Schema for listing providers query params
 */
export const listProvidersQuerySchema = z.object({
  isEnabled: z.coerce.boolean().optional(),
  providerType: providerTypeSchema.optional(),
  includeModels: z.coerce.boolean().default(false),
});

export type ListProvidersQueryInput = z.infer<typeof listProvidersQuerySchema>;

/**
 * Schema for listing models query params
 */
export const listModelsQuerySchema = z.object({
  providerId: z.string().uuid().optional(),
  providerKey: z.string().optional(),
  modelType: modelTypeSchema.optional(),
  isAvailable: z.coerce.boolean().optional(),
  includeProvider: z.coerce.boolean().default(false),
});

export type ListModelsQueryInput = z.infer<typeof listModelsQuerySchema>;

/**
 * Schema for getting models for a specific purpose
 */
export const getModelsForPurposeQuerySchema = z.object({
  purpose: defaultPurposeSchema,
  includeDisabledProviders: z.coerce.boolean().default(false),
});

export type GetModelsForPurposeQueryInput = z.infer<typeof getModelsForPurposeQuerySchema>;

// ============================================================================
// ACTION SCHEMAS
// ============================================================================

/**
 * Schema for testing provider connection
 */
export const testConnectionSchema = z.object({
  providerId: z.string().uuid('Invalid provider ID'),
});

export type TestConnectionInput = z.infer<typeof testConnectionSchema>;

/**
 * Schema for discovering Ollama models
 */
export const discoverModelsSchema = z.object({
  providerId: z.string().uuid('Invalid provider ID'),
  removeUnavailable: z.boolean().default(false),
});

export type DiscoverModelsInput = z.infer<typeof discoverModelsSchema>;

// ============================================================================
// PARAM SCHEMAS
// ============================================================================

/**
 * Schema for provider ID param
 */
export const providerIdParamSchema = z.object({
  providerId: z.string().uuid('Invalid provider ID'),
});

export type ProviderIdParam = z.infer<typeof providerIdParamSchema>;

// Alias for handler use (expects { id: string })
export const providerIdSchema = z.object({
  id: z.string().uuid('Invalid provider ID'),
});

/**
 * Schema for model ID param
 */
export const modelIdParamSchema = z.object({
  modelId: z.coerce.number().int().positive('Invalid model ID'),
});

export type ModelIdParam = z.infer<typeof modelIdParamSchema>;

// Alias for handler use (expects { id: number })
export const modelIdSchema = z.object({
  id: z.coerce.number().int().positive('Invalid model ID'),
});