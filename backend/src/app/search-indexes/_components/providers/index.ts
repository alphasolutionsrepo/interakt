// app/search-indexes/_components/providers/index.ts

/**
 * Provider UI Barrel Export
 *
 * Import this module to ensure all provider UIs are registered.
 * Each provider's index.ts auto-registers with the provider registry.
 */

// Register all provider UIs
import './elasticsearch';
import './azure-ai-search';

// Re-export registry functions and types
export { registerProviderUI, getProviderUI, getAllProviderUIs, hasProviderUI } from './provider-registry';
export type { ProviderUIRegistration, ProviderSettingsFormProps, ProviderFieldSettingsProps } from './types';
