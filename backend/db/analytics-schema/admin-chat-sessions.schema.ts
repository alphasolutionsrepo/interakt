// db/analytics-schema/admin-chat-sessions.schema.ts

/**
 * ADMIN CHAT SESSIONS SCHEMA
 * ------------------------------------------------------------------------
 * Stores analytics chat sessions for admin users.
 * These are conversations between admins and the AI analytics assistant.
 *
 * DATABASE: Analytics DB (separate from main app DB)
 * CONFIG: drizzle.analytics.config.ts
 * ------------------------------------------------------------------------
 */

import {
  pgTable,
  varchar,
  timestamp,
  json,
  jsonb,
  uuid,
  integer,
  text,
  index,
} from 'drizzle-orm/pg-core';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';

// ============================================================================
// MESSAGE TYPE
// ============================================================================

/**
 * Chat message structure stored in sessions
 */
export interface AdminChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO string
  toolsUsed?: string[];
  error?: boolean;
  analyticsData?: AdminChatAnalyticsData[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/**
 * Structured analytics data attached to messages
 */
export interface AdminChatAnalyticsData {
  tool: string;
  dataType: string;
  data: unknown;
}

// ============================================================================
// ADMIN CHAT SESSIONS TABLE
// ============================================================================

/**
 * Admin Chat Sessions
 * Stores conversations between admins and the analytics AI assistant
 */
export const adminChatSessions = pgTable(
  'admin_chat_sessions',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),

    // Session metadata
    title: varchar('title', { length: 255 }).notNull(),

    // Messages stored as JSON array
    messages: json('messages').$type<AdminChatMessage[]>().notNull().default([]),

    // AI configuration used
    providerId: varchar('provider_id', { length: 255 }),
    modelId: integer('model_id'),

    // Context management
    summary: text('summary'), // Compressed older conversation history
    facts: jsonb('facts').$type<Record<string, string>>().default({}),

    // Usage tracking
    totalTokens: integer('total_tokens').default(0),
    totalInputTokens: integer('total_input_tokens').default(0),
    totalOutputTokens: integer('total_output_tokens').default(0),
    messageCount: integer('message_count').default(0),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  },
  (table) => ({
    createdAtIdx: index('idx_admin_chat_sessions_created').on(table.createdAt),
    lastMessageAtIdx: index('idx_admin_chat_sessions_last_message').on(table.lastMessageAt),
    titleIdx: index('idx_admin_chat_sessions_title').on(table.title),
  })
);

export type AdminChatSession = InferSelectModel<typeof adminChatSessions>;
export type InsertAdminChatSession = InferInsertModel<typeof adminChatSessions>;

// ============================================================================
// SESSION SUMMARY TYPE (for list views)
// ============================================================================

export interface AdminChatSessionSummary {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
}
