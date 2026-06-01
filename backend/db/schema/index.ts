// db/schema/index.ts

/**
 * Database Schema - Main Export
 * Re-exports all schemas and defines relationships
 */

import { relations } from 'drizzle-orm';

// ============================================================================
// IMPORT ALL ENUMS
// ============================================================================

export * from './enums.schema';

// ============================================================================
// IMPORT ALL SCHEMAS
// ============================================================================

// Users
export * from './users.schema';
import { user } from './users.schema';

// Search Index
export * from './search-index.schema';
import { searchIndex } from './search-index.schema';

// Search Index Fields (NEW - replaces index-field-mappings)
export * from './search-index-fields.schema';
import { searchIndexFields } from './search-index-fields.schema';

// Indexing Batches
export * from './indexing-batches.schema';
import { indexingBatches, indexingBatchesRelations } from './indexing-batches.schema';

// Seed Registry
export * from './seed-registry.schema';
import { seedRegistry } from './seed-registry.schema';

// AI Providers
export * from './ai-providers.schema';
import { aiProviders, aiProviderModels, systemDefaults } from './ai-providers.schema';

// Search Experience
export * from './search-experience.schema';
import {
  searchExperiences,
  searchExperienceIndexes,
  searchExperiencesRelations,
  searchExperienceIndexesRelations,
} from './search-experience.schema';

// Global Search Settings
export * from './global-search-settings.schema';
import { globalSearchSettings } from './global-search-settings.schema';

// Domain Knowledge
export * from './domain-knowledge.schema';
import { domainKnowledge, domainKnowledgeRelations } from './domain-knowledge.schema';

// Data Sources
export * from './data-sources.schema';
import { dataSources } from './data-sources.schema';

// Tools
export * from './tools.schema';
import { tools } from './tools.schema';

// AI Experience
export * from './ai-experience.schema';
import {
  aiExperiences,
  aiExperienceTools,
  aiExperienceToolsRelations,
} from './ai-experience.schema';

// MCP Connections
export * from './mcp-connections.schema';
import {
  mcpConnections,
  aiExperienceMcpConnections,
  mcpConnectionsRelations,
  aiExperienceMcpConnectionsRelations,
} from './mcp-connections.schema';

// AI Sessions
export * from './ai-sessions.schema';
import {
  aiSessions,
  aiSessionMessages,
  aiSessionsRelations,
  aiSessionMessagesRelations,
} from './ai-sessions.schema';

// AI Experiences Relations — defined here to combine tools + sessions + mcpConnections
// without forcing the schema files into a circular import.
export const aiExperiencesRelations = relations(aiExperiences, ({ many }) => ({
  tools: many(aiExperienceTools),
  sessions: many(aiSessions),
  mcpConnections: many(aiExperienceMcpConnections),
}));

// Knowledge Base (Domain Knowledge Base — Sprint 6)
export * from './knowledge-base.schema';
import {
  knowledgeDocuments,
  knowledgeChunks,
  knowledgeDocumentsRelations,
  knowledgeChunksRelations,
} from './knowledge-base.schema';

// User Memories (Episodic Memory — Sprint 5)
export * from './user-memories.schema';
import {
  userMemories,
  userMemoriesRelations,
} from './user-memories.schema';

// Secrets
export * from './secrets.schema';
import { secrets } from './secrets.schema';

// Prompt Templates
export * from './prompt-templates.schema';
import {
  promptTemplates,
  aiExperiencePromptOverrides,
  promptTemplatesRelations,
  aiExperiencePromptOverridesRelations,
} from './prompt-templates.schema';

// ============================================================================
// DEFINE RELATIONSHIPS
// ============================================================================

/**
 * User Relations
 */
export const userRelations = relations(user, ({ }) => ({
  // User relations can be extended as needed
}));

/**
 * Search Index Relations
 */
export const searchIndexRelations = relations(searchIndex, ({ one, many }) => ({
  aiProvider: one(aiProviders, {
    fields: [searchIndex.aiProviderId],
    references: [aiProviders.id],
  }),
  aiModel: one(aiProviderModels, {
    fields: [searchIndex.aiModelId],
    references: [aiProviderModels.id],
  }),
  // Search index fields (replaces fieldMappings)
  fields: many(searchIndexFields),
  // Domain knowledge entries for this index
  knowledgeEntries: many(domainKnowledge),
}));

/**
 * Search Index Fields Relations (NEW)
 */
export const searchIndexFieldsRelations = relations(searchIndexFields, ({ one }) => ({
  searchIndex: one(searchIndex, {
    fields: [searchIndexFields.searchIndexId],
    references: [searchIndex.id],
  }),
}));

// ============================================================================
// AI PROVIDER RELATIONS
// ============================================================================

/**
 * AI Providers Relations
 */
export const aiProvidersRelations = relations(aiProviders, ({ many }) => ({
  models: many(aiProviderModels),
}));

/**
 * AI Provider Models Relations
 */
export const aiProviderModelsRelations = relations(aiProviderModels, ({ one }) => ({
  provider: one(aiProviders, {
    fields: [aiProviderModels.providerId],
    references: [aiProviders.id],
  }),
}));

// Note: systemDefaults relations are intentionally NOT defined here
// because they have multiple foreign keys to the same tables.
// Use manual joins in the repository instead.

// ============================================================================
// DATA SOURCES RELATIONS
// ============================================================================

/**
 * Data Sources Relations
 */
export const dataSourcesRelations = relations(dataSources, ({ one }) => ({
  searchIndex: one(searchIndex, {
    fields: [dataSources.searchIndexId],
    references: [searchIndex.id],
  }),
}));

// ============================================================================
// TOOLS RELATIONS
// ============================================================================

/**
 * Tools Relations
 */
export const toolsRelations = relations(tools, ({ one, many }) => ({
  dataSource: one(dataSources, {
    fields: [tools.dataSourceId],
    references: [dataSources.id],
  }),
  aiExperienceTools: many(aiExperienceTools),
}));

// ============================================================================
// SCHEMA OBJECT FOR DRIZZLE
// ============================================================================

export const schema = {
  // Users
  user,
  userRelations,

  // Search Index
  searchIndex,
  searchIndexRelations,

  // Search Index Fields (NEW)
  searchIndexFields,
  searchIndexFieldsRelations,

  // Indexing Batches
  indexingBatches,
  indexingBatchesRelations,

  // Seed Registry
  seedRegistry,

  // AI Providers
  aiProviders,
  aiProviderModels,
  systemDefaults,
  aiProvidersRelations,
  aiProviderModelsRelations,

  // Search Experience
  searchExperiences,
  searchExperienceIndexes,
  searchExperiencesRelations,
  searchExperienceIndexesRelations,

  // Global Search Settings
  globalSearchSettings,

  // Domain Knowledge
  domainKnowledge,
  domainKnowledgeRelations,

  // Data Sources
  dataSources,
  dataSourcesRelations,

  // Tools
  tools,
  toolsRelations,

  // AI Experience
  aiExperiences,
  aiExperienceTools,
  aiExperiencesRelations,
  aiExperienceToolsRelations,

  // MCP Connections
  mcpConnections,
  aiExperienceMcpConnections,
  mcpConnectionsRelations,
  aiExperienceMcpConnectionsRelations,

  // AI Sessions
  aiSessions,
  aiSessionMessages,
  aiSessionsRelations,
  aiSessionMessagesRelations,

  // Knowledge Base (Domain Knowledge Base)
  knowledgeDocuments,
  knowledgeChunks,
  knowledgeDocumentsRelations,
  knowledgeChunksRelations,

  // User Memories (Episodic Memory)
  userMemories,
  userMemoriesRelations,

  // Secrets
  secrets,

  // Prompt Templates
  promptTemplates,
  aiExperiencePromptOverrides,
  promptTemplatesRelations,
  aiExperiencePromptOverridesRelations,
};