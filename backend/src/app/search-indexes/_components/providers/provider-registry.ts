// app/search-indexes/_components/providers/provider-registry.ts

/**
 * Provider UI Registry
 *
 * Client-side registry for provider-specific UI components.
 * Each provider registers itself via registerProviderUI() in its index.ts.
 */

import type { ProviderUIRegistration } from './types';

const registry = new Map<string, ProviderUIRegistration>();

/**
 * Register a provider's UI components.
 * Called by each provider's index.ts at import time.
 */
export function registerProviderUI(registration: ProviderUIRegistration): void {
    registry.set(registration.type, registration);
}

/**
 * Get a provider's UI registration by type.
 */
export function getProviderUI(type: string): ProviderUIRegistration | undefined {
    return registry.get(type);
}

/**
 * Get all registered provider UIs.
 */
export function getAllProviderUIs(): ProviderUIRegistration[] {
    return Array.from(registry.values());
}

/**
 * Check if a provider UI is registered.
 */
export function hasProviderUI(type: string): boolean {
    return registry.has(type);
}
