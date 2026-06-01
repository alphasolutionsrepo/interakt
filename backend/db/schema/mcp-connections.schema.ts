// db/schema/mcp-connections.schema.ts

/**
 * MCP Connections Schema
 *
 * An MCP Connection is a configuration entity that points at an external
 * Model Context Protocol server. It is NOT a tool — it is a tool *provider*.
 *
 * One connection yields N tools, discovered live via the MCP `tools/list` RPC.
 * We cache the last-discovered tool catalog so chat turns don't pay a network
 * round-trip; `POST /api/mcp-connections/{id}/sync` refreshes it.
 *
 * Experiences attach to connections via `ai_experience_mcp_connections`;
 * each attachment can optionally restrict which tool names are exposed.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  json,
  integer,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { mcpTransportEnum, mcpConnectionStatusEnum } from './enums.schema';
import { aiExperiences } from './ai-experience.schema';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface McpAuthConfig {
  type: 'none' | 'bearer' | 'header';
  /** Reference to secret in vault: e.g. "{{secret:my_mcp_token}}" or bare secret name */
  secretRef?: string;
  /** Header name when type='header' (e.g., "X-API-Key") */
  headerName?: string;
}

/**
 * A single discovered MCP tool, captured from `tools/list`.
 * Stored as-is (no normalization) so we can pass schemas straight through
 * to the LLM as ToolDefinition.parameters.
 */
export interface DiscoveredMcpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface DiscoveredToolCatalog {
  tools: DiscoveredMcpTool[];
  serverInfo?: {
    name?: string;
    version?: string;
  };
  protocolVersion?: string;
}

// ============================================================================
// MCP CONNECTIONS TABLE
// ============================================================================

export const mcpConnections = pgTable('mcp_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description'),

  // ─── CONNECTION ───────────────────────────────────────────────────────────
  serverUrl: text('server_url').notNull(),
  transport: mcpTransportEnum('transport').notNull().default('streamable-http'),
  authConfig: json('auth_config').$type<McpAuthConfig>(),

  // ─── DISCOVERY ────────────────────────────────────────────────────────────
  /** Cached tools/list response. Refreshed by sync endpoint. */
  discoveredTools: json('discovered_tools').$type<DiscoveredToolCatalog>(),
  lastDiscoveredAt: timestamp('last_discovered_at', { withTimezone: true }),

  // ─── HEALTH ───────────────────────────────────────────────────────────────
  status: mcpConnectionStatusEnum('status').default('unknown').notNull(),
  lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
  lastHealthMessage: text('last_health_message'),

  // ─── LIFECYCLE ────────────────────────────────────────────────────────────
  isActive: boolean('is_active').default(true).notNull(),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  slugIdx: index('mcp_connections_slug_idx').on(table.slug),
  statusIdx: index('mcp_connections_status_idx').on(table.status),
  isActiveIdx: index('mcp_connections_is_active_idx').on(table.isActive),
}));

// ============================================================================
// EXPERIENCE ↔ CONNECTION JUNCTION
// ============================================================================

export const aiExperienceMcpConnections = pgTable('ai_experience_mcp_connections', {
  id: uuid('id').primaryKey().defaultRandom(),

  aiExperienceId: uuid('ai_experience_id')
    .notNull()
    .references(() => aiExperiences.id, { onDelete: 'cascade' }),

  mcpConnectionId: uuid('mcp_connection_id')
    .notNull()
    .references(() => mcpConnections.id, { onDelete: 'restrict' }),

  /**
   * Subset of tool names from the connection to expose in this experience.
   * `null` means "all discovered tools".
   */
  enabledToolNames: json('enabled_tool_names').$type<string[] | null>(),

  isEnabled: boolean('is_enabled').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  experienceIdx: index('aemc_experience_idx').on(table.aiExperienceId),
  connectionIdx: index('aemc_connection_idx').on(table.mcpConnectionId),
  uniqueCombo: unique('aemc_experience_connection_unique').on(table.aiExperienceId, table.mcpConnectionId),
}));

// ============================================================================
// RELATIONS
// ============================================================================

export const mcpConnectionsRelations = relations(mcpConnections, ({ many }) => ({
  experienceAttachments: many(aiExperienceMcpConnections),
}));

export const aiExperienceMcpConnectionsRelations = relations(aiExperienceMcpConnections, ({ one }) => ({
  aiExperience: one(aiExperiences, {
    fields: [aiExperienceMcpConnections.aiExperienceId],
    references: [aiExperiences.id],
  }),
  mcpConnection: one(mcpConnections, {
    fields: [aiExperienceMcpConnections.mcpConnectionId],
    references: [mcpConnections.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type McpConnection = typeof mcpConnections.$inferSelect;
export type NewMcpConnection = typeof mcpConnections.$inferInsert;

export type AIExperienceMcpConnection = typeof aiExperienceMcpConnections.$inferSelect;
export type NewAIExperienceMcpConnection = typeof aiExperienceMcpConnections.$inferInsert;
