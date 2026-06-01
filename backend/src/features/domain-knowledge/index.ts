// src/features/domain-knowledge/index.ts

/**
 * Domain Knowledge Feature
 *
 * Provides domain knowledge management for the deterministic chat pipeline.
 * Knowledge is tied to Search Indexes and shared across Search Experiences.
 */

// Types
export * from './domain-knowledge.types';

// Elasticsearch utilities
export {
  getKnowledgeIndexName,
  createKnowledgeIndex,
  deleteKnowledgeIndex,
  knowledgeIndexExists,
  indexKnowledgeEntry,
  bulkIndexKnowledgeEntries,
  removeKnowledgeEntry,
  searchKnowledge,
  buildKnowledgeESDocument,
  refreshKnowledgeIndex,
} from './domain-knowledge.elasticsearch';

// Service
export {
  createKnowledgeEntry,
  bulkCreateKnowledgeEntries,
  getKnowledgeEntryById,
  getKnowledgeEntriesBySearchIndex,
  countKnowledgeEntries,
  findRelevantKnowledge,
  updateKnowledgeEntry,
  toggleKnowledgeEntryStatus,
  deleteKnowledgeEntry,
  deleteAllKnowledgeForSearchIndex,
  rebuildKnowledgeIndex,
  ensureKnowledgeIndex,
  getDomainKnowledgeService,
  DomainKnowledgeService,
} from './domain-knowledge.service';

// API Handlers
export {
  handleListKnowledgeEntries,
  handleCreateKnowledgeEntry,
  handleGetKnowledgeEntry,
  handleUpdateKnowledgeEntry,
  handleDeleteKnowledgeEntry,
} from './domain-knowledge.api.handlers';
