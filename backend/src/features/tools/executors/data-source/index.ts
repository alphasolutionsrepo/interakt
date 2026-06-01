// src/features/tools/executors/data-source/index.ts

/**
 * Data Source Operation Executors
 *
 * Each operation is a single-purpose executor that does exactly one thing.
 * The dispatcher routes to the correct executor based on the tool's `operation` field.
 */

export { executeDataSourceSearch } from './search';
export { executeDataSourceInspect } from './inspect';
export { executeDataSourceEnumerate } from './enumerate';
export { executeDataSourceLookup } from './lookup';

// Re-export shared types
export type { ResolvedSource, ResolvedManagedSource, ResolvedExternalSource, ResolvedFileStoreSource } from './shared';
