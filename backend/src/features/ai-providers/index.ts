// src/features/ai-providers/index.ts

/**
 * AI Providers Feature - Public API
 * 
 * IMPORTANT: Only export client-safe items here
 * Server-only exports (service, repository, handlers) should be imported directly
 */

// ============================================================================
// TYPE EXPORTS (Client-safe)
// ============================================================================

export type {
  // Enum types
  AIModelType,
  AIAuthType,
  AIProviderType,
  AIDefaultPurpose,
  
  // Database entity types
  AIProvider,
  NewAIProvider,
  AIProviderModel,
  NewAIProviderModel,
  SystemDefaults,
  AIProviderWithModels,
  AIProviderSettings,
  AIModelCapabilities,
  
  // DTO types
  CreateAIProviderInput,
  UpdateAIProviderInput,
  CreateAIModelInput,
  UpdateAIModelInput,
  UpdateSystemDefaultsInput,
  SetDefaultInput,
  SetDefaultBodyInput,
  
  // Query types
  ListProvidersQueryInput,
  ListModelsQueryInput,
  GetModelsForPurposeQueryInput,
  
  // Response types
  AIProviderResponse,
  AIProviderWithModelsResponse,
  AIProviderModelResponse,
  AIModelWithProviderResponse,
  SystemDefaultsResponse,
  ResolvedSystemDefaults,
  
  // Ollama types
  OllamaModelInfo,
  OllamaTagsResponse,
  OllamaDiscoveryResult,
  
  // Connection types
  ConnectionTestResult,
} from './ai-providers.types';

// Re-export enum values for convenience
export {
  AI_MODEL_TYPES,
  AI_AUTH_TYPES,
  AI_PROVIDER_TYPES,
  AI_DEFAULT_PURPOSES,
} from './ai-providers.types';

// Re-export UI metadata
export {
  AI_MODEL_TYPE_INFO,
  AI_PROVIDER_TYPE_INFO,
  AI_AUTH_TYPE_INFO,
} from './ai-providers.types';

// Re-export type guards
export {
  isValidModelType,
  isValidAuthType,
  isValidProviderType,
  isEmbeddingModel,
  isChatModel,
  requiresApiKey,
} from './ai-providers.types';

// ============================================================================
// VALIDATION SCHEMA EXPORTS (Client-safe)
// ============================================================================

export {
  // Provider schemas
  createAIProviderSchema,
  updateAIProviderSchema,
  
  // Model schemas
  createAIModelSchema,
  updateAIModelSchema,
  
  // System defaults schemas
  updateSystemDefaultsSchema,
  setDefaultSchema,
  setDefaultBodySchema,
  
  // Query schemas
  listProvidersQuerySchema,
  listModelsQuerySchema,
  getModelsForPurposeQuerySchema,
  
  // Parameter schemas
  providerIdSchema,
  modelIdSchema,
  
  // Action schemas
  testConnectionSchema,
  discoverModelsSchema,
  
  // Enum schemas
  modelTypeSchema,
  authTypeSchema,
  providerTypeSchema,
  defaultPurposeSchema,
} from './ai-providers.validation';

// ============================================================================
// SERVICE EXPORTS (Server-only - use direct import for handlers)
// ============================================================================

// Note: Service functions are exported for use in other server-side code
// For API routes, import handlers directly:
// import { handleListProviders } from '@/features/ai-providers/ai-providers.handlers';

export {
  // Provider operations
  getProviderById,
  getProviderByIdWithModels,
  getProviderByKey,
  getProviderByKeyWithModels,
  listProviders,
  getEnabledProviders,
  
  // Model operations
  getModelById,
  getModelByIdWithProvider,
  listModels,
  listModelsWithProvider,
  getModelsForPurpose,
  
  // System defaults
  getSystemDefaults,
  getResolvedDefaults,
  
  // Connection testing
  testConnection,
  
  // Ollama discovery
  discoverOllamaModels,
} from './ai-providers.service';