// src/shared/seeders/seeder.types.ts

/**
 * Seeder Types
 * Shared types for the seeding system
 */

import type { FieldType } from '@/shared/constants/field-types';
import type { FieldMappingConfig } from '@/shared/constants/search-index.constants';

// ============================================================================
// SEED TEMPLATE TYPES
// ============================================================================

/**
 * Field definition for seed templates
 */
export interface SeedTemplateField {
  fieldName: string;
  fieldType: FieldType;
  displayName: string;
  isRequired: boolean;
  isFacetable: boolean;
  includeInResponse: boolean;
  isSearchable: boolean;
  boostValue: number;
  /**
   * Suggested default mapping configuration for this field.
   * Used as a hint when auto-mapping or as a default in the UI.
   * Particularly useful for computed fields derived from nested arrays.
   */
  suggestedMappingConfig?: FieldMappingConfig;
}

/**
 * Data template seed definition
 */
export interface SeedDataTemplate {
  slug: string;
  name: string;
  description: string;
  icon: string;
  fields: SeedTemplateField[];
}

// ============================================================================
// SEEDING RESULT TYPES
// ============================================================================

/**
 * Result of seeding a single item
 */
export interface SeedItemResult {
  key: string;
  status: 'created' | 'skipped' | 'updated' | 'error';
  message: string;
  entityId?: number | string;
}

/**
 * Result of a seeding operation
 */
export interface SeedOperationResult {
  success: boolean;
  seedType: string;
  totalProcessed: number;
  created: number;
  skipped: number;
  updated: number;
  errors: number;
  items: SeedItemResult[];
  duration: number; // milliseconds
}

/**
 * Overall seeding result
 */
export interface SeedingResult {
  success: boolean;
  operations: SeedOperationResult[];
  totalDuration: number;
  timestamp: string;
}

// ============================================================================
// SEEDING OPTIONS
// ============================================================================

/**
 * Options for seeding operations
 */
export interface SeedOptions {
  /**
   * Force reseed even if checksum matches (dangerous - resets to defaults)
   */
  force?: boolean;
  
  /**
   * Specific seed keys to process (if empty, process all)
   */
  keys?: string[];
  
  /**
   * Dry run - don't actually create/update, just report what would happen
   */
  dryRun?: boolean;
}

// ============================================================================
// REGISTRY TYPES
// ============================================================================

/**
 * Seed registry entry
 */
export interface SeedRegistryEntry {
  seedType: string;
  seedKey: string;
  checksum: string;
  seededAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Checksum comparison result
 */
export interface ChecksumComparison {
  key: string;
  currentChecksum: string;
  storedChecksum: string | null;
  isNew: boolean;
  hasChanged: boolean;
}