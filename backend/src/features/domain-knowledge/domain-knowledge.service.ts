// src/features/domain-knowledge/domain-knowledge.service.ts

/**
 * Domain Knowledge Service
 *
 * Business logic for domain knowledge management.
 * Handles CRUD operations with automatic Elasticsearch sync.
 *
 * Design philosophy:
 * - Knowledge is a pool of facts (FAQs, extracts, domain info)
 * - Index-agnostic: works for any domain
 * - Simple: no topics, just tags for organization
 */

import 'server-only';

import { createLogger } from '@/shared/logger/logger';
import * as repository from './domain-knowledge.repository';
import {
  createKnowledgeIndex,
  deleteKnowledgeIndex,
  knowledgeIndexExists,
  indexKnowledgeEntry,
  bulkIndexKnowledgeEntries,
  removeKnowledgeEntry,
  searchKnowledge,
  buildKnowledgeESDocument,
} from './domain-knowledge.elasticsearch';
import type {
  CreateDomainKnowledgeInput,
  UpdateDomainKnowledgeInput,
  ParsedKnowledgeEntry,
  KnowledgeSearchOptions,
  KnowledgeSearchResult,
  KnowledgeSyncResult,
} from './domain-knowledge.types';
import type { DomainKnowledge } from '@/db/schema/domain-knowledge.schema';

const logger = createLogger('domain-knowledge-service');

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parse tags from comma-separated string to array
 */
function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  return tags
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0);
}

/**
 * Serialize tags array to comma-separated string
 */
function serializeTags(tags: string[] | undefined): string | null {
  if (!tags || tags.length === 0) return null;
  return tags.map(t => t.trim().toLowerCase()).join(',');
}

/**
 * Convert DB entry to parsed entry with tags as array
 */
function toParsedEntry(entry: DomainKnowledge): ParsedKnowledgeEntry {
  return {
    ...entry,
    tags: parseTags(entry.tags),
  };
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

/**
 * Create a new knowledge entry.
 * Automatically syncs to Elasticsearch.
 */
export async function createKnowledgeEntry(
  input: CreateDomainKnowledgeInput
): Promise<ParsedKnowledgeEntry> {
  logger.info('Creating knowledge entry', {
    searchIndexId: input.searchIndexId,
  });

  // Ensure knowledge index exists
  const indexExists = await knowledgeIndexExists(input.searchIndexId);
  if (!indexExists) {
    await createKnowledgeIndex(input.searchIndexId);
  }

  // Create in database
  const entry = await repository.createEntry({
    searchIndexId: input.searchIndexId,
    question: input.question,
    answer: input.answer,
    tags: serializeTags(input.tags),
    priority: input.priority ?? 0,
    isActive: true,
    createdBy: input.createdBy ?? null,
    updatedBy: null,
  });

  // Sync to Elasticsearch
  const parsed = toParsedEntry(entry);
  const esDoc = buildKnowledgeESDocument({
    id: parsed.id,
    question: parsed.question,
    answer: parsed.answer,
    tags: parsed.tags,
    priority: parsed.priority,
    isActive: parsed.isActive,
  });

  await indexKnowledgeEntry(input.searchIndexId, esDoc);

  logger.info('Knowledge entry created', { entryId: entry.id });

  return parsed;
}

/**
 * Bulk create knowledge entries.
 * Automatically syncs to Elasticsearch.
 */
export async function bulkCreateKnowledgeEntries(
  searchIndexId: string,
  inputs: Array<Omit<CreateDomainKnowledgeInput, 'searchIndexId'>>
): Promise<{ created: ParsedKnowledgeEntry[]; syncResult: KnowledgeSyncResult }> {
  if (inputs.length === 0) {
    return {
      created: [],
      syncResult: { success: true, indexed: 0, failed: 0 },
    };
  }

  logger.info('Bulk creating knowledge entries', {
    searchIndexId,
    count: inputs.length,
  });

  // Ensure knowledge index exists
  const indexExists = await knowledgeIndexExists(searchIndexId);
  if (!indexExists) {
    await createKnowledgeIndex(searchIndexId);
  }

  // Create in database
  const entries = await repository.createEntries(
    inputs.map(input => ({
      searchIndexId,
      question: input.question,
      answer: input.answer,
      tags: serializeTags(input.tags),
      priority: input.priority ?? 0,
      isActive: true,
      createdBy: input.createdBy ?? null,
      updatedBy: null,
    }))
  );

  // Parse entries
  const parsed = entries.map(toParsedEntry);

  // Sync to Elasticsearch
  const esDocs = parsed.map(entry =>
    buildKnowledgeESDocument({
      id: entry.id,
      question: entry.question,
      answer: entry.answer,
      tags: entry.tags,
      priority: entry.priority,
      isActive: entry.isActive,
    })
  );

  const syncResult = await bulkIndexKnowledgeEntries(searchIndexId, esDocs);

  logger.info('Bulk created knowledge entries', {
    searchIndexId,
    created: parsed.length,
    indexed: syncResult.indexed,
    failed: syncResult.failed,
  });

  return { created: parsed, syncResult };
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get a knowledge entry by ID
 */
export async function getKnowledgeEntryById(
  id: string
): Promise<ParsedKnowledgeEntry | null> {
  const entry = await repository.getEntryById(id);
  return entry ? toParsedEntry(entry) : null;
}

/**
 * Get all knowledge entries for a search index
 */
export async function getKnowledgeEntriesBySearchIndex(
  searchIndexId: string,
  options?: {
    activeOnly?: boolean;
  }
): Promise<ParsedKnowledgeEntry[]> {
  const entries = await repository.getEntriesBySearchIndexId(searchIndexId, options);
  return entries.map(toParsedEntry);
}

/**
 * Count knowledge entries for a search index
 */
export async function countKnowledgeEntries(
  searchIndexId: string
): Promise<number> {
  return repository.countEntriesBySearchIndexId(searchIndexId);
}

// ============================================================================
// SEARCH OPERATIONS
// ============================================================================

/**
 * Search knowledge entries for a given query.
 * Uses Elasticsearch for fuzzy matching and relevance scoring.
 */
export async function findRelevantKnowledge(
  searchIndexId: string,
  query: string,
  options?: KnowledgeSearchOptions
): Promise<KnowledgeSearchResult[]> {
  return searchKnowledge(searchIndexId, query, options);
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update a knowledge entry.
 * Automatically syncs changes to Elasticsearch.
 */
export async function updateKnowledgeEntry(
  id: string,
  input: UpdateDomainKnowledgeInput
): Promise<ParsedKnowledgeEntry> {
  logger.info('Updating knowledge entry', { entryId: id });

  // Get existing entry to get searchIndexId
  const existing = await repository.getEntryById(id);
  if (!existing) {
    throw new Error(`Knowledge entry not found: ${id}`);
  }

  // Build update data
  const updateData: Parameters<typeof repository.updateEntry>[1] = {
    updatedBy: input.updatedBy ?? null,
  };

  if (input.question !== undefined) updateData.question = input.question;
  if (input.answer !== undefined) updateData.answer = input.answer;
  if (input.tags !== undefined) updateData.tags = serializeTags(input.tags);
  if (input.priority !== undefined) updateData.priority = input.priority;
  if (input.isActive !== undefined) updateData.isActive = input.isActive;

  // Update in database
  const updated = await repository.updateEntry(id, updateData);
  const parsed = toParsedEntry(updated);

  // Sync to Elasticsearch
  const esDoc = buildKnowledgeESDocument({
    id: parsed.id,
    question: parsed.question,
    answer: parsed.answer,
    tags: parsed.tags,
    priority: parsed.priority,
    isActive: parsed.isActive,
  });

  await indexKnowledgeEntry(existing.searchIndexId, esDoc);

  logger.info('Knowledge entry updated', { entryId: id });

  return parsed;
}

/**
 * Toggle entry active status
 */
export async function toggleKnowledgeEntryStatus(
  id: string,
  isActive: boolean,
  updatedBy?: string
): Promise<ParsedKnowledgeEntry> {
  return updateKnowledgeEntry(id, { isActive, updatedBy });
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

/**
 * Delete a knowledge entry.
 * Automatically removes from Elasticsearch.
 */
export async function deleteKnowledgeEntry(id: string): Promise<void> {
  logger.info('Deleting knowledge entry', { entryId: id });

  // Get entry to get searchIndexId
  const entry = await repository.getEntryById(id);
  if (!entry) {
    logger.warn('Knowledge entry not found for deletion', { entryId: id });
    return;
  }

  // Delete from database
  await repository.deleteEntry(id);

  // Remove from Elasticsearch
  await removeKnowledgeEntry(entry.searchIndexId, id);

  logger.info('Knowledge entry deleted', { entryId: id });
}

/**
 * Delete all knowledge entries for a search index.
 * Also deletes the Elasticsearch index.
 */
export async function deleteAllKnowledgeForSearchIndex(
  searchIndexId: string
): Promise<number> {
  logger.info('Deleting all knowledge for search index', { searchIndexId });

  // Delete from database
  const deletedCount = await repository.deleteEntriesBySearchIndexId(searchIndexId);

  // Delete Elasticsearch index
  await deleteKnowledgeIndex(searchIndexId);

  logger.info('Deleted all knowledge for search index', {
    searchIndexId,
    deletedCount,
  });

  return deletedCount;
}

// ============================================================================
// SYNC OPERATIONS
// ============================================================================

/**
 * Rebuild the Elasticsearch index from database.
 * Use this to recover from index corruption or after manual DB edits.
 */
export async function rebuildKnowledgeIndex(
  searchIndexId: string
): Promise<KnowledgeSyncResult> {
  logger.info('Rebuilding knowledge index', { searchIndexId });

  // Delete existing index
  await deleteKnowledgeIndex(searchIndexId);

  // Create fresh index
  await createKnowledgeIndex(searchIndexId);

  // Get all active entries from database
  const entries = await repository.getActiveEntries(searchIndexId);
  const parsed = entries.map(toParsedEntry);

  if (parsed.length === 0) {
    return { success: true, indexed: 0, failed: 0 };
  }

  // Build ES documents
  const esDocs = parsed.map(entry =>
    buildKnowledgeESDocument({
      id: entry.id,
      question: entry.question,
      answer: entry.answer,
      tags: entry.tags,
      priority: entry.priority,
      isActive: entry.isActive,
    })
  );

  // Bulk index
  const result = await bulkIndexKnowledgeEntries(searchIndexId, esDocs);

  logger.info('Knowledge index rebuilt', {
    searchIndexId,
    totalEntries: parsed.length,
    indexed: result.indexed,
    failed: result.failed,
  });

  return result;
}

/**
 * Ensure knowledge index exists for a search index.
 * Creates it if it doesn't exist.
 */
export async function ensureKnowledgeIndex(
  searchIndexId: string
): Promise<boolean> {
  const exists = await knowledgeIndexExists(searchIndexId);
  if (!exists) {
    const result = await createKnowledgeIndex(searchIndexId);
    return result.success;
  }
  return true;
}

// ============================================================================
// SINGLETON SERVICE (for dependency injection patterns)
// ============================================================================

class DomainKnowledgeService {
  create = createKnowledgeEntry;
  bulkCreate = bulkCreateKnowledgeEntries;
  getById = getKnowledgeEntryById;
  getBySearchIndex = getKnowledgeEntriesBySearchIndex;
  count = countKnowledgeEntries;
  findRelevant = findRelevantKnowledge;
  update = updateKnowledgeEntry;
  toggleStatus = toggleKnowledgeEntryStatus;
  delete = deleteKnowledgeEntry;
  deleteAllForSearchIndex = deleteAllKnowledgeForSearchIndex;
  rebuildIndex = rebuildKnowledgeIndex;
  ensureIndex = ensureKnowledgeIndex;
}

let serviceInstance: DomainKnowledgeService | null = null;

export function getDomainKnowledgeService(): DomainKnowledgeService {
  if (!serviceInstance) {
    serviceInstance = new DomainKnowledgeService();
  }
  return serviceInstance;
}

export { DomainKnowledgeService };
