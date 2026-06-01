// src/shared/seeders/ai-providers/ai-providers.seeds.ts

/**
 * AI Providers Seed Data
 * Defines the initial AI providers and models to seed
 * 
 * This follows the same pattern as data-template.seeds.ts
 * All data here is used ONLY for initial seeding.
 * Once seeded, the database is the source of truth.
 */

import type { AIModelType, AIAuthType, AIProviderType } from '@/features/ai-providers/ai-providers.types';

// ============================================================================
// SEED DATA TYPES
// ============================================================================

export interface SeedAIProvider {
    providerKey: string;
    displayName: string;
    description: string;
    providerType: AIProviderType;
    authType: AIAuthType;
    baseUrl: string;
    isEnabled: boolean;
    supportsModelDiscovery: boolean;
    settings: Record<string, unknown>;
    models: SeedAIModel[];
}

export interface SeedAIModel {
    modelKey: string;
    displayName: string;
    description: string;
    modelType: AIModelType;
    dimensions?: number;
    capabilities: Record<string, unknown>;
    sortOrder: number;
}

// ============================================================================
// SEED DATA: PROVIDERS AND MODELS
// ============================================================================

/**
 * All AI providers to seed
 * Providers are identified by providerKey (unique)
 */
export const AI_PROVIDER_SEEDS: SeedAIProvider[] = [
    // -------------------------------------------------------------------------
    // OLLAMA - Local AI (enabled by default, no API key required)
    // -------------------------------------------------------------------------
    {
        providerKey: 'ollama',
        displayName: 'Ollama',
        description: 'Local AI models running on your infrastructure. Free and private.',
        providerType: 'local',
        authType: 'none',
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        isEnabled: true, // Enabled by default - no API key needed
        supportsModelDiscovery: true,
        settings: {
            keepAlive: '5m',
            timeout: 120000, // 2 minutes for local models
        },
        models: [
            // Chat/Text Models — qwen2.5 / llama3.1 first: modern small models with
            // real native tool-calling, which the deterministic chat pipeline needs.
            {
                modelKey: 'qwen2.5:7b',
                displayName: 'Qwen 2.5 7B',
                description: 'Best small model for tool-calling + structured output (~4.7GB). Recommended for the demo.',
                modelType: 'chat',
                capabilities: { contextWindow: 32768, supportsStreaming: true, supportsFunctionCalling: true },
                sortOrder: 0,
            },
            {
                modelKey: 'llama3.1:8b',
                displayName: 'Llama 3.1 8B',
                description: 'Meta Llama 3.1 with native tool support and 128k context (~4.9GB).',
                modelType: 'chat',
                capabilities: { contextWindow: 131072, supportsStreaming: true, supportsFunctionCalling: true },
                sortOrder: 1,
            },
            {
                modelKey: 'qwen2.5:14b',
                displayName: 'Qwen 2.5 14B',
                description: 'Higher-quality answers, still fast on Apple Silicon (~9GB).',
                modelType: 'chat',
                capabilities: { contextWindow: 32768, supportsStreaming: true, supportsFunctionCalling: true },
                sortOrder: 2,
            },
            {
                modelKey: 'qwen2.5:32b',
                displayName: 'Qwen 2.5 32B',
                description: 'Best local reasoning quality — closest to GPT-4o-class for the demo. Native tool-calling, ~20GB (needs ~24GB+ RAM).',
                modelType: 'chat',
                capabilities: { contextWindow: 32768, supportsStreaming: true, supportsFunctionCalling: true },
                sortOrder: 3,
            },
            {
                modelKey: 'llama3',
                displayName: 'Llama 3',
                description: 'Meta Llama 3 - fast and capable general-purpose model',
                modelType: 'chat',
                capabilities: { contextWindow: 8192, supportsStreaming: true },
                sortOrder: 4,
            },
            {
                modelKey: 'llama3:8b',
                displayName: 'Llama 3 8B',
                description: 'Llama 3 with 8 billion parameters',
                modelType: 'chat',
                capabilities: { contextWindow: 8192, supportsStreaming: true },
                sortOrder: 5,
            },
            {
                modelKey: 'llama3:70b',
                displayName: 'Llama 3 70B',
                description: 'Llama 3 with 70 billion parameters - highest quality',
                modelType: 'chat',
                capabilities: { contextWindow: 8192, supportsStreaming: true },
                sortOrder: 6,
            },
            {
                modelKey: 'mistral',
                displayName: 'Mistral 7B',
                description: 'Mistral 7B - excellent quality/speed ratio',
                modelType: 'chat',
                capabilities: { contextWindow: 32768, supportsStreaming: true },
                sortOrder: 7,
            },
            {
                modelKey: 'gemma2',
                displayName: 'Gemma 2',
                description: 'Google Gemma 2 - lightweight and fast',
                modelType: 'chat',
                capabilities: { contextWindow: 8192, supportsStreaming: true },
                sortOrder: 8,
            },
            // Embedding Models
            {
                modelKey: 'nomic-embed-text',
                displayName: 'Nomic Embed Text',
                description: 'High quality local embeddings',
                modelType: 'embedding',
                dimensions: 768,
                capabilities: {},
                sortOrder: 10,
            },
            {
                modelKey: 'nomic-embed-text:v1.5',
                displayName: 'Nomic Embed Text v1.5',
                description: 'Latest Nomic embeddings with improved performance',
                modelType: 'embedding',
                dimensions: 768,
                capabilities: {},
                sortOrder: 11,
            },
            {
                modelKey: 'mxbai-embed-large',
                displayName: 'MixedBread Embed Large',
                description: 'Large embedding model with 1024 dimensions',
                modelType: 'embedding',
                dimensions: 1024,
                capabilities: {},
                sortOrder: 12,
            },
        ],
    },

    // -------------------------------------------------------------------------
    // OPENAI - Cloud AI (disabled by default, requires API key)
    // -------------------------------------------------------------------------
    {
        providerKey: 'openai',
        displayName: 'OpenAI',
        description: 'OpenAI API for GPT models and embeddings. Requires API key.',
        providerType: 'cloud',
        authType: 'api_key',
        baseUrl: 'https://api.openai.com/v1',
        isEnabled: false, // Disabled by default - requires API key
        supportsModelDiscovery: false,
        settings: {
            timeout: 60000, // 1 minute
            maxRetries: 3,
        },
        models: [
            // Chat/Text Models
            {
                modelKey: 'gpt-4o',
                displayName: 'GPT-4o',
                description: 'Most capable GPT-4 model for complex tasks',
                modelType: 'chat',
                capabilities: {
                    contextWindow: 128000,
                    supportsStreaming: true,
                    supportsJsonMode: true,
                    supportsFunctionCalling: true,
                },
                sortOrder: 0,
            },
            {
                modelKey: 'gpt-4o-mini',
                displayName: 'GPT-4o Mini',
                description: 'Smaller, faster, cheaper GPT-4 variant',
                modelType: 'chat',
                capabilities: {
                    contextWindow: 128000,
                    supportsStreaming: true,
                    supportsJsonMode: true,
                    supportsFunctionCalling: true,
                },
                sortOrder: 1,
            },
            {
                modelKey: 'gpt-4-turbo',
                displayName: 'GPT-4 Turbo',
                description: 'Previous generation GPT-4 with vision support',
                modelType: 'chat',
                capabilities: {
                    contextWindow: 128000,
                    supportsStreaming: true,
                    supportsJsonMode: true,
                    supportsFunctionCalling: true,
                    supportsVision: true,
                },
                sortOrder: 2,
            },
            // Embedding Models
            {
                modelKey: 'text-embedding-3-small',
                displayName: 'Text Embedding 3 Small',
                description: 'Efficient embedding model for most use cases',
                modelType: 'embedding',
                dimensions: 1536,
                capabilities: {},
                sortOrder: 10,
            },
            {
                modelKey: 'text-embedding-3-large',
                displayName: 'Text Embedding 3 Large',
                description: 'Higher quality embeddings with more dimensions',
                modelType: 'embedding',
                dimensions: 3072,
                capabilities: {},
                sortOrder: 11,
            },
        ],
    },
];

// ============================================================================
// SYSTEM DEFAULTS SEED DATA
// ============================================================================

/**
 * Default system configuration
 * References provider and model by keys (resolved to IDs during seeding)
 * Uses Ollama by default since it's free and local
 */
export interface SeedSystemDefaults {
    defaultTextProviderKey: string;
    defaultTextModelKey: string;
    defaultEmbeddingProviderKey: string;
    defaultEmbeddingModelKey: string;
    defaultChatProviderKey: string;
    defaultChatModelKey: string;
}

export const SYSTEM_DEFAULTS_SEED: SeedSystemDefaults = {
    // Text generation default
    defaultTextProviderKey: 'ollama',
    defaultTextModelKey: 'llama3',

    // Embedding default
    defaultEmbeddingProviderKey: 'ollama',
    defaultEmbeddingModelKey: 'nomic-embed-text:v1.5',

    // Chat default
    defaultChatProviderKey: 'ollama',
    defaultChatModelKey: 'llama3',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a seed provider by key
 */
export function getSeedProviderByKey(providerKey: string): SeedAIProvider | undefined {
    return AI_PROVIDER_SEEDS.find(p => p.providerKey === providerKey);
}

/**
 * Get all seed provider keys
 */
export function getAllSeedProviderKeys(): string[] {
    return AI_PROVIDER_SEEDS.map(p => p.providerKey);
}

/**
 * Get models for a provider from seed data
 */
export function getSeedModelsForProvider(providerKey: string): SeedAIModel[] {
    const provider = getSeedProviderByKey(providerKey);
    return provider?.models || [];
}