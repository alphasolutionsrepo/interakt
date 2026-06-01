// config/ai-providers.config.ts

/**
 * AI Providers Configuration
 *
 * Contains provider-specific settings including health check URLs.
 * Health checks use official status pages (free, no API tokens needed).
 *
 * For local providers (like Ollama), we test their local API endpoint.
 */

export interface ProviderHealthConfig {
  /** Official status page URL (for cloud providers) */
  statusPageUrl?: string;
  /** Health check endpoint to ping (relative to baseUrl or absolute) */
  healthCheckEndpoint?: string;
  /** Whether this is a local/self-hosted provider */
  isLocal: boolean;
  /** Human-readable description of what we check */
  checkDescription: string;
}

/**
 * Health check configuration by provider key
 *
 * Add new providers here as they are supported.
 */
export const providerHealthConfig: Record<string, ProviderHealthConfig> = {
  // OpenAI - Cloud provider with official status page
  openai: {
    statusPageUrl: 'https://status.openai.com',
    healthCheckEndpoint: 'https://status.openai.com/api/v2/status.json',
    isLocal: false,
    checkDescription: 'Checks OpenAI official status page',
  },

  // Anthropic - Cloud provider with official status page
  anthropic: {
    statusPageUrl: 'https://status.anthropic.com',
    healthCheckEndpoint: 'https://status.anthropic.com/api/v2/status.json',
    isLocal: false,
    checkDescription: 'Checks Anthropic official status page',
  },

  // Google AI (Gemini) - Cloud provider
  google: {
    statusPageUrl: 'https://status.cloud.google.com',
    // Google doesn't have a simple status JSON endpoint, so we test API availability
    isLocal: false,
    checkDescription: 'Checks Google Cloud status',
  },

  // Azure OpenAI - Cloud provider
  azure: {
    statusPageUrl: 'https://status.azure.com',
    isLocal: false,
    checkDescription: 'Checks Azure status page',
  },

  // Ollama - Local provider, test local API
  ollama: {
    healthCheckEndpoint: '/api/tags', // Relative to baseUrl
    isLocal: true,
    checkDescription: 'Tests local Ollama API endpoint',
  },

  // LM Studio - Local provider
  lmstudio: {
    healthCheckEndpoint: '/v1/models', // OpenAI-compatible endpoint
    isLocal: true,
    checkDescription: 'Tests local LM Studio API endpoint',
  },

  // Generic/Custom - Will test baseUrl directly
  custom: {
    isLocal: true,
    checkDescription: 'Tests configured base URL',
  },
};

/**
 * Get health config for a provider
 * Falls back to generic config if provider not found
 */
export function getProviderHealthConfig(providerKey: string): ProviderHealthConfig {
  return providerHealthConfig[providerKey.toLowerCase()] ?? {
    isLocal: true,
    checkDescription: 'Tests configured base URL',
  };
}

/**
 * Status page response format (Atlassian Statuspage format used by OpenAI, Anthropic, etc.)
 */
export interface StatusPageResponse {
  status: {
    indicator: 'none' | 'minor' | 'major' | 'critical';
    description: string;
  };
  page?: {
    name: string;
    url: string;
  };
}

export type AIProvidersConfig = {
  healthCheck: {
    /** Timeout for health check requests in ms */
    timeoutMs: number;
    /** How often to refresh health status when auto-refresh is enabled (ms) */
    refreshIntervalMs: number;
  };
  providers: Record<string, ProviderHealthConfig>;
};

export const aiProvidersConfig: AIProvidersConfig = {
  healthCheck: {
    timeoutMs: 10000, // 10 seconds
    refreshIntervalMs: 30000, // 30 seconds (matches UI auto-refresh)
  },
  providers: providerHealthConfig,
};
