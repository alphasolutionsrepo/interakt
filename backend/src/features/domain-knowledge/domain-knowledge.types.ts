// src/features/domain-knowledge/domain-knowledge.types.ts

/**
 * Domain Knowledge Types
 *
 * Types for the domain knowledge feature, used by both
 * the service layer and the deterministic chat pipeline.
 *
 * Design philosophy:
 * - Knowledge is a pool of facts (FAQs, extracts, domain info)
 * - Not directly linked to items in the main index
 * - Index-agnostic: works for any domain
 * - Simple enable/disable per experience
 */

import type {
  DomainKnowledge,
  CreateDomainKnowledgeInput,
  UpdateDomainKnowledgeInput,
} from '@/db/schema/domain-knowledge.schema';

// Re-export schema types
export type {
  DomainKnowledge,
  CreateDomainKnowledgeInput,
  UpdateDomainKnowledgeInput,
};

// ============================================================================
// ELASTICSEARCH DOCUMENT TYPES
// ============================================================================

/**
 * Document structure for Elasticsearch knowledge index
 */
export interface KnowledgeESDocument {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  /** Concatenated searchable text for full-text search */
  searchableText: string;
  priority: number;
  isActive: boolean;
}

/**
 * Elasticsearch index settings for knowledge
 */
export interface KnowledgeIndexSettings {
  numberOfShards?: number;
  numberOfReplicas?: number;
  /** Custom synonyms for this index's domain */
  synonyms?: string[];
}

// ============================================================================
// SEARCH TYPES
// ============================================================================

/**
 * Options for searching knowledge entries
 */
export interface KnowledgeSearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Minimum score threshold (0-100, ES scores vary) */
  minScore?: number;
}

/**
 * A knowledge search result with score
 */
export interface KnowledgeSearchResult {
  /** The knowledge entry */
  entry: {
    id: string;
    question: string;
    answer: string;
    tags: string[];
    priority: number;
  };
  /** Elasticsearch relevance score */
  score: number;
}

// ============================================================================
// SERVICE TYPES
// ============================================================================

/**
 * Result of knowledge sync operation
 */
export interface KnowledgeSyncResult {
  success: boolean;
  indexed: number;
  failed: number;
  errors?: string[];
}

/**
 * Parsed knowledge entry (with tags as array)
 */
export interface ParsedKnowledgeEntry {
  id: string;
  searchIndexId: string;
  question: string;
  answer: string;
  tags: string[];
  priority: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

// ============================================================================
// KNOWLEDGE CONFIG TYPES (for Search Experience)
// ============================================================================

/**
 * Knowledge configuration for a search experience.
 * Simple: just enable/disable.
 */
export interface KnowledgeConfig {
  /** Enable knowledge action for this experience */
  enabled: boolean;
}

/**
 * Default knowledge config when not specified
 */
export const DEFAULT_KNOWLEDGE_CONFIG: KnowledgeConfig = {
  enabled: true,
};
