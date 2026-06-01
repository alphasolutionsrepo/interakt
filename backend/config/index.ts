// config/index.ts

/**
 * Centralized configuration export
 * Single import point for all configuration
 */

import { appConfig, validateAppConfig, type AppConfig } from './app.config';
import { databaseConfig, validateDatabaseConfig, type DatabaseConfig } from './database.config';
import { cacheConfig, type CacheConfig } from './cache.config';
import { loggerConfig, type LoggerConfig } from './logger.config';
import { elasticsearchConfig, validateElasticsearchConfig, type ElasticsearchConfig } from './elasticsearch.config';
import { aiProvidersConfig, getProviderHealthConfig, type AIProvidersConfig, type ProviderHealthConfig, type StatusPageResponse } from './ai-providers.config';
import { searchProvidersConfig, type SearchProvidersConfig, type SearchProviderDefinition } from './search-provider.config';

// Only validate configs in production runtime, not during build
const isProduction = process.env.NODE_ENV === 'production';
const isBuild = process.env.NEXT_PHASE === 'phase-production-build';

if (isProduction && !isBuild) {
  try {
    validateAppConfig();
    validateDatabaseConfig();
  } catch (error) {
    console.error('Configuration validation failed:', error);
    throw new Error('Configuration validation failed');
  }
}

// Export all configs
export {
  appConfig,
  databaseConfig,
  cacheConfig,
  loggerConfig,
  elasticsearchConfig,
  aiProvidersConfig,
  getProviderHealthConfig,
  searchProvidersConfig,
};

// Export config types
export type {
  AIProvidersConfig,
  ProviderHealthConfig,
  StatusPageResponse,
  AppConfig,
  DatabaseConfig,
  CacheConfig,
  LoggerConfig,
  ElasticsearchConfig,
  SearchProvidersConfig,
  SearchProviderDefinition,
};

// Helper function to get all config (for debugging)
export function getAllConfig() {
  return {
    app: appConfig,
    database: databaseConfig,
    cache: cacheConfig,
    logger: loggerConfig,
    elasticsearch: elasticsearchConfig,
    aiProviders: aiProvidersConfig,
    searchProviders: searchProvidersConfig,
  };
}

// Export validation functions for manual use
export {
  validateElasticsearchConfig,
};