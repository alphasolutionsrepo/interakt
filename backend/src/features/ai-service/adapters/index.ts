// src/features/ai-service/adapters/index.ts

/**
 * AI Provider Adapters - Factory & Exports
 * 
 * Provides a factory function to get the appropriate adapter
 * based on provider key.
 */

import { OpenAIAdapter } from './openai.adapter';
import { OllamaAdapter } from './ollama.adapter';
import type { AIProviderAdapter } from './types';
import { AIServiceError } from '../ai-service.types';

// Export types
export * from './types';

// Export adapters for direct use if needed
export { OpenAIAdapter } from './openai.adapter';
export { OllamaAdapter } from './ollama.adapter';

// ============================================================================
// ADAPTER REGISTRY
// ============================================================================

/**
 * Registry of available adapters
 * Add new adapters here as they are implemented
 */
const adapterRegistry: Record<string, () => AIProviderAdapter> = {
  openai: () => new OpenAIAdapter(),
  ollama: () => new OllamaAdapter(),
};

/**
 * Cache of instantiated adapters (singletons)
 */
const adapterCache: Map<string, AIProviderAdapter> = new Map();

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Get an adapter instance for the specified provider
 * 
 * @param providerKey - The provider key (e.g., 'openai', 'ollama')
 * @returns The adapter instance
 * @throws AIServiceError if provider is not supported
 * 
 * @example
 * const adapter = getAdapter('openai');
 * const result = await adapter.generateText(request, config);
 */
export function getAdapter(providerKey: string): AIProviderAdapter {
  // Check cache first
  const cached = adapterCache.get(providerKey);
  if (cached) {
    return cached;
  }

  // Get factory function
  const factory = adapterRegistry[providerKey];
  if (!factory) {
    throw new AIServiceError(
      `Unsupported AI provider: ${providerKey}`,
      'PROVIDER_NOT_FOUND',
      undefined,
      providerKey
    );
  }

  // Create and cache adapter
  const adapter = factory();
  adapterCache.set(providerKey, adapter);

  return adapter;
}

/**
 * Check if a provider is supported
 * 
 * @param providerKey - The provider key to check
 * @returns True if the provider is supported
 */
export function isProviderSupported(providerKey: string): boolean {
  return providerKey in adapterRegistry;
}

/**
 * Get list of supported provider keys
 * 
 * @returns Array of supported provider keys
 */
export function getSupportedProviders(): string[] {
  return Object.keys(adapterRegistry);
}

/**
 * Register a new adapter (for plugins/extensions)
 * 
 * @param providerKey - The provider key
 * @param factory - Factory function that creates the adapter
 */
export function registerAdapter(
  providerKey: string,
  factory: () => AIProviderAdapter
): void {
  adapterRegistry[providerKey] = factory;
  // Clear cache if adapter was previously instantiated
  adapterCache.delete(providerKey);
}

/**
 * Clear the adapter cache (useful for testing)
 */
export function clearAdapterCache(): void {
  adapterCache.clear();
}