// src/features/ai-providers/ai-providers.types.ts

/**
 * AI Providers Feature - Type Definitions
 * Domain types and re-exports of validation-inferred types
 * 
 * Following the same pattern as data-templates.types.ts
 */

// ============================================================================
// RE-EXPORT VALIDATION TYPES (Single Source of Truth for DTOs)
// ============================================================================

export type {
  // Enum types
  AIModelType,
  AIAuthType,
  AIProviderType,
  AIDefaultPurpose,
  
  // Provider DTOs
  CreateAIProviderInput,
  UpdateAIProviderInput,
  
  // Model DTOs
  CreateAIModelInput,
  UpdateAIModelInput,
  
  // System defaults DTOs
  UpdateSystemDefaultsInput,
  SetDefaultInput,
  SetDefaultBodyInput,
  
  // Query types
  ListProvidersQueryInput,
  ListModelsQueryInput,
  GetModelsForPurposeQueryInput,
  
  // Action types
  TestConnectionInput,
  DiscoverModelsInput,
  
  // Param types
  ProviderIdParam,
  ModelIdParam,
} from './ai-providers.validation';

// Re-export enum values for use in seeds, UI, etc.
export {
  AI_MODEL_TYPES,
  AI_AUTH_TYPES,
  AI_PROVIDER_TYPES,
  AI_DEFAULT_PURPOSES,
} from './ai-providers.validation';

// ============================================================================
// RE-EXPORT DATABASE TYPES (Single Source of Truth for Entities)
// ============================================================================

export type {
  // Provider types
  AIProvider,
  NewAIProvider,
  UpdateAIProvider,
  
  // Model types
  AIProviderModel,
  NewAIProviderModel,
  UpdateAIProviderModel,
  
  // System defaults types
  SystemDefaults,
  NewSystemDefaults,
  UpdateSystemDefaults,
  
  // Extended types
  AIProviderWithModels,
  SystemDefaultsWithDetails,
  
  // JSON field types
  AIProviderSettings,
  AIModelCapabilities,
} from '@/db/schema/ai-providers.schema';

// ============================================================================
// API RESPONSE TYPES (Domain-specific)
// ============================================================================

import type { AIProviderSettings, AIModelCapabilities } from '@/db/schema/ai-providers.schema';
import type { AIModelType, AIAuthType, AIProviderType, AIDefaultPurpose } from './ai-providers.validation';

/**
 * AI Provider response (safe for API - no sensitive data exposed)
 */
export interface AIProviderResponse {
  id: string;
  providerKey: string;
  displayName: string;
  description: string | null;
  providerType: AIProviderType;
  authType: AIAuthType;
  baseUrl: string;
  hasApiKey: boolean; // Indicates if API key is set, without exposing it
  isEnabled: boolean;
  settings: AIProviderSettings;
  lastConnectionCheck: Date | null;
  lastConnectionStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AI Provider with models (for list views)
 */
export interface AIProviderWithModelsResponse extends AIProviderResponse {
  models: AIProviderModelResponse[];
  modelCount: number;
  enabledModelCount: number;
}

/**
 * AI Model response
 */
export interface AIProviderModelResponse {
  id: number;
  providerId: string;
  modelKey: string;
  displayName: string;
  description: string | null;
  modelType: AIModelType;
  dimensions: number | null;
  capabilities: AIModelCapabilities;
  isAvailable: boolean;
  isDiscovered: boolean;
  sortOrder: number;
  // Pricing for cost estimation (admin-configured)
  inputCostPerMillionTokens: number | null;
  outputCostPerMillionTokens: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AI Model with provider info (for dropdowns)
 */
export interface AIModelWithProviderResponse extends AIProviderModelResponse {
  provider: {
    id: string;
    providerKey: string;
    displayName: string;
    isEnabled: boolean;
  };
}

/**
 * System defaults response with resolved details
 */
export interface SystemDefaultsResponse {
  id: string;
  
  // Text generation defaults
  defaultTextProviderId: string | null;
  defaultTextModelId: number | null;
  defaultTextProvider: AIProviderResponse | null;
  defaultTextModel: AIProviderModelResponse | null;
  
  // Embedding defaults
  defaultEmbeddingProviderId: string | null;
  defaultEmbeddingModelId: number | null;
  defaultEmbeddingProvider: AIProviderResponse | null;
  defaultEmbeddingModel: AIProviderModelResponse | null;
  
  // Chat defaults
  defaultChatProviderId: string | null;
  defaultChatModelId: number | null;
  defaultChatProvider: AIProviderResponse | null;
  defaultChatModel: AIProviderModelResponse | null;
  
  updatedAt: Date;
}

/**
 * Simplified defaults for common use (cached in memory)
 */
export interface ResolvedSystemDefaults {
  text: {
    providerId: string | null;
    providerKey: string | null;
    modelId: number | null;
    modelKey: string | null;
  };
  embedding: {
    providerId: string | null;
    providerKey: string | null;
    modelId: number | null;
    modelKey: string | null;
    dimensions: number | null;
  };
  chat: {
    providerId: string | null;
    providerKey: string | null;
    modelId: number | null;
    modelKey: string | null;
  };
}

// ============================================================================
// OLLAMA-SPECIFIC TYPES
// ============================================================================

/**
 * Ollama model info from /api/tags endpoint
 */
export interface OllamaModelInfo {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

/**
 * Ollama /api/tags response
 */
export interface OllamaTagsResponse {
  models: OllamaModelInfo[];
}

/**
 * Result of Ollama model discovery
 */
export interface OllamaDiscoveryResult {
  success: boolean;
  modelsFound: number;
  modelsAdded: number;
  modelsUpdated: number;
  modelsRemoved: number;
  errors: string[];
}

// ============================================================================
// CONNECTION TEST TYPES
// ============================================================================

/**
 * Result of provider connection test
 */
export interface ConnectionTestResult {
  providerId: string;
  providerKey: string;
  success: boolean;
  message: string;
  responseTimeMs: number;
  details?: {
    version?: string;
    modelsAvailable?: number;
    error?: string;
  };
  testedAt: Date;
}

// ============================================================================
// UI METADATA (for display purposes)
// ============================================================================

/**
 * Display info for model types
 */
export const AI_MODEL_TYPE_INFO: Record<AIModelType, {
  label: string;
  description: string;
  icon: string;
}> = {
  text: {
    label: 'Text Generation',
    description: 'General text completion and generation',
    icon: 'type',
  },
  embedding: {
    label: 'Embedding',
    description: 'Vector embeddings for semantic search',
    icon: 'hash',
  },
  chat: {
    label: 'Chat',
    description: 'Conversational AI models',
    icon: 'message-circle',
  },
  vision: {
    label: 'Vision',
    description: 'Image understanding models',
    icon: 'eye',
  },
};

/**
 * Display info for default purposes
 */
export const AI_DEFAULT_PURPOSE_INFO: Record<AIDefaultPurpose, {
  label: string;
  description: string;
  recommendedModelType: AIModelType;
}> = {
  text_generation: {
    label: 'Text Generation',
    description: 'Default model for general text generation tasks',
    recommendedModelType: 'text',
  },
  embedding: {
    label: 'Embedding',
    description: 'Default model for creating vector embeddings (semantic search)',
    recommendedModelType: 'embedding',
  },
  chat: {
    label: 'Chat / Conversation',
    description: 'Default model for chat interfaces and conversational AI',
    recommendedModelType: 'chat',
  },
};

/**
 * Display info for provider types
 */
export const AI_PROVIDER_TYPE_INFO: Record<AIProviderType, {
  label: string;
  description: string;
  icon: string;
}> = {
  cloud: {
    label: 'Cloud Provider',
    description: 'External cloud-hosted AI service',
    icon: 'cloud',
  },
  local: {
    label: 'Local Provider',
    description: 'AI service running on local infrastructure',
    icon: 'server',
  },
};

/**
 * Display info for auth types
 */
export const AI_AUTH_TYPE_INFO: Record<AIAuthType, {
  label: string;
  description: string;
  requiresKey: boolean;
}> = {
  api_key: {
    label: 'API Key',
    description: 'Requires an API key for authentication',
    requiresKey: true,
  },
  none: {
    label: 'No Authentication',
    description: 'No authentication required',
    requiresKey: false,
  },
  oauth: {
    label: 'OAuth',
    description: 'OAuth-based authentication',
    requiresKey: false,
  },
};

// ============================================================================
// TYPE GUARDS
// ============================================================================

import { AI_MODEL_TYPES, AI_AUTH_TYPES, AI_PROVIDER_TYPES } from './ai-providers.validation';

export function isValidModelType(type: string): type is AIModelType {
  return AI_MODEL_TYPES.includes(type as AIModelType);
}

export function isValidAuthType(type: string): type is AIAuthType {
  return AI_AUTH_TYPES.includes(type as AIAuthType);
}

export function isValidProviderType(type: string): type is AIProviderType {
  return AI_PROVIDER_TYPES.includes(type as AIProviderType);
}

export function isEmbeddingModel(model: AIProviderModelResponse): boolean {
  return model.modelType === 'embedding';
}

export function isChatModel(model: AIProviderModelResponse): boolean {
  return model.modelType === 'chat' || model.modelType === 'text';
}

export function requiresApiKey(provider: AIProviderResponse): boolean {
  return provider.authType === 'api_key';
}