// db/schema/ai-experience.schema.ts

/**
 * AI Experience Schema (Rebuilt)
 *
 * An AI Experience is the complete configuration of an AI assistant — from how
 * it thinks (pipeline) to what it can do (tools) to how it talks (persona) to
 * who can access it (access controls).
 *
 * Configuration is split into explicit domain columns instead of a monolithic
 * JSON blob, making each domain independently queryable and validatable.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  json,
  timestamp,
  integer,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { pipelineModeEnum } from './enums.schema';
import { tools } from './tools.schema';
import type { PipelineConfig } from '@/features/pipeline/pipeline.types';

// ============================================================================
// TYPE DEFINITIONS FOR JSON COLUMNS
// ============================================================================

/** The Voice: How the AI communicates */
export interface PersonaConfig {
  /** Display name for the assistant (e.g., "PlumbPro Assistant") */
  name?: string;
  /** Avatar URL for the assistant */
  avatarUrl?: string;
  /** Tone preset */
  tone: 'professional' | 'friendly' | 'casual' | 'enthusiastic' | 'concise';
  /** The main system prompt / instructions */
  systemInstructions: string;
  /** Topics the AI should excel at */
  focusAreas?: string[];
  /** Topics to deflect away from */
  avoidTopics?: string[];
  /** Business domains for topic gating */
  businessDomains?: string[];
  /** Response formatting preferences */
  responseFormats: {
    enabledPresets: ResponsePreset[];
    defaultPreset: ResponsePreset;
    maxResponseLength?: number;
    enableCitations: boolean;
    citationStyle: 'inline' | 'footnote' | 'none';
  };
}

export type ResponsePreset =
  | 'markdown_rich'
  | 'plain_text'
  | 'single_card'
  | 'item_grid'
  | 'comparison_table'
  | 'step_list'
  | 'summary_with_sources';

/** The Rules: Input/output guardrail configuration */
export interface GuardrailConfig {
  inputGuardrail: GuardrailStepConfig;
  outputGuardrail: GuardrailStepConfig;
}

export interface GuardrailStepConfig {
  enabled: boolean;
  rules: GuardrailRule[];
  onBlock: {
    message: string;
  };
}

export interface GuardrailRule {
  id: string;
  name: string;
  type: GuardrailRuleType;
  config: Record<string, unknown>;
  action: 'block' | 'warn' | 'redact' | 'reroute';
  enabled: boolean;
  priority: number;
}

export type GuardrailRuleType =
  | 'topic_gate'
  | 'blocklist'
  | 'allowlist'
  | 'regex_filter'
  | 'pii_detection'
  | 'content_policy'
  | 'max_length'
  | 'language_filter'
  | 'llm_judge';

/** The Memory: Session lifecycle and memory settings */
export interface SessionConfig {
  /** Session time-to-live in minutes (default: 1440 = 24h) */
  sessionTtlMinutes: number;
  /** Limit concurrent sessions per user */
  maxSessionsPerUser?: number;
  /** Sliding window size for conversation context */
  maxContextMessages: number;
  /** Auto-summarize when window exceeds limit */
  enableConversationSummary: boolean;
  /** Messages before summarization kicks in */
  summaryThreshold: number;
  /** Enable user context / identity (Phase 3) */
  enableUserContext: boolean;
}

/** The Door: How customers access the experience */
export interface AccessConfig {
  /** Allowed CORS origins (empty = allow all) */
  allowedOrigins: string[];
  /** Rate limiting */
  rateLimits: {
    chatPerMinute: number;
    requestsPerDay: number;
  };
  /** Embed widget configuration (Phase 3) */
  embedConfig?: {
    widgetTheme: 'light' | 'dark' | 'auto';
    /** @deprecated Use `launcher` + `placement`. Kept for backward compatibility. */
    widgetPosition: 'bottom-right' | 'bottom-left' | 'inline';
    /** How the widget surfaces on the host page. Default 'floating'. */
    launcher?: 'floating' | 'inline' | 'button';
    /** Which viewport corner a floating widget anchors to. Default 'bottom-right'. */
    placement?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    primaryColor?: string;
    welcomeMessage?: string;
    welcomeDescription?: string;
    suggestedQuestions?: string[];
    placeholder?: string;
    showBranding: boolean;
  };
}

/** The Loop: Agentic mode runtime settings */
export interface AgenticConfig {
  /** Max tool-calling iterations before forcing a final response (default: 5) */
  maxIterations: number;
  /** Enable multi-step planning before execution (Phase C, default: false) */
  enablePlanning?: boolean;
}

/** The Eyes: What you can see */
export interface ObservabilityConfig {
  /** Telemetry detail level */
  telemetryDetailLevel: 'off' | 'metadata' | 'full';
  /** Store conversation transcripts */
  enableConversationLogging: boolean;
  /** Auto-delete conversations after N days */
  conversationRetentionDays: number;
}

// ============================================================================
// AI EXPERIENCES TABLE
// ============================================================================

export const aiExperiences = pgTable('ai_experiences', {
  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY
  // ═══════════════════════════════════════════════════════════════════════════
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description'),
  icon: varchar('icon', { length: 100 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // THE BRAIN: Pipeline configuration
  // ═══════════════════════════════════════════════════════════════════════════

  /** Pipeline mode — determines the default step composition */
  pipelineMode: pipelineModeEnum('pipeline_mode').notNull().default('deterministic'),

  /** Full pipeline step configuration (mode, steps, settings) */
  pipelineConfig: json('pipeline_config').$type<PipelineConfig>(),

  /** Agentic loop runtime settings (maxIterations, enablePlanning) */
  agenticConfig: json('agentic_config').$type<AgenticConfig>(),

  // ═══════════════════════════════════════════════════════════════════════════
  // THE VOICE: Persona configuration
  // ═══════════════════════════════════════════════════════════════════════════

  /** How the AI communicates — tone, instructions, formatting */
  personaConfig: json('persona_config').$type<PersonaConfig>().notNull(),

  // ═══════════════════════════════════════════════════════════════════════════
  // THE RULES: Guardrail configuration
  // ═══════════════════════════════════════════════════════════════════════════

  /** Input/output guardrail rules */
  guardrailConfig: json('guardrail_config').$type<GuardrailConfig>(),

  // ═══════════════════════════════════════════════════════════════════════════
  // THE MEMORY: Session configuration
  // ═══════════════════════════════════════════════════════════════════════════

  /** Session lifecycle, memory, and user context settings */
  sessionConfig: json('session_config').$type<SessionConfig>().notNull(),

  // ═══════════════════════════════════════════════════════════════════════════
  // THE DOOR: Access configuration
  // ═══════════════════════════════════════════════════════════════════════════

  /** Access token for public API authentication */
  accessToken: uuid('access_token').defaultRandom().unique().notNull(),

  /** CORS, rate limits, embed settings */
  accessConfig: json('access_config').$type<AccessConfig>().notNull(),

  // ═══════════════════════════════════════════════════════════════════════════
  // THE EYES: Observability configuration
  // ═══════════════════════════════════════════════════════════════════════════

  /** Telemetry, logging, retention */
  observabilityConfig: json('observability_config').$type<ObservabilityConfig>().notNull(),

  // ═══════════════════════════════════════════════════════════════════════════
  // AI PROVIDER (explicit columns for queryability)
  // ═══════════════════════════════════════════════════════════════════════════

  /** AI provider ID (null = use system default) */
  providerId: uuid('provider_id'),

  /** AI model ID (null = use system default) */
  modelId: integer('model_id'),

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS & LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════
  isActive: boolean('is_active').default(true).notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by'),

}, (table) => ({
  slugIdx: index('ai_experiences_slug_idx').on(table.slug),
  accessTokenIdx: index('ai_experiences_access_token_idx').on(table.accessToken),
  isActiveIdx: index('ai_experiences_is_active_idx').on(table.isActive),
  pipelineModeIdx: index('ai_experiences_pipeline_mode_idx').on(table.pipelineMode),
  createdAtIdx: index('ai_experiences_created_at_idx').on(table.createdAt),
}));

// ============================================================================
// AI EXPERIENCE TOOLS (JUNCTION TABLE)
// ============================================================================

export const aiExperienceTools = pgTable('ai_experience_tools', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** Reference to the AI experience */
  aiExperienceId: uuid('ai_experience_id')
    .notNull()
    .references(() => aiExperiences.id, { onDelete: 'cascade' }),

  /** Reference to the tool */
  toolId: uuid('tool_id')
    .notNull()
    .references(() => tools.id, { onDelete: 'restrict' }),

  // ═══════════════════════════════════════════════════════════════════════════
  // OVERRIDES
  // ═══════════════════════════════════════════════════════════════════════════

  /** Override the tool's default AI description for this experience */
  overrideAiDescription: text('override_ai_description'),

  /** Experience-specific config overrides (merged with tool's base config) */
  overrideConfig: json('override_config').$type<Record<string, unknown>>(),

  /** Whether this tool is enabled in this experience */
  isEnabled: boolean('is_enabled').default(true).notNull(),

  /** Display/priority ordering (lower = higher priority) */
  sortOrder: integer('sort_order').default(0).notNull(),

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT
  // ═══════════════════════════════════════════════════════════════════════════
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),

}, (table) => ({
  experienceIdx: index('aet_experience_idx').on(table.aiExperienceId),
  toolIdx: index('aet_tool_idx').on(table.toolId),
  uniqueCombo: unique('aet_experience_tool_unique').on(table.aiExperienceId, table.toolId),
}));

// ============================================================================
// RELATIONS
// ============================================================================

// Note: aiExperiencesRelations is defined in db/schema/index.ts so it can
// reference the mcp-connections junction without a circular import.

export const aiExperienceToolsRelations = relations(aiExperienceTools, ({ one }) => ({
  aiExperience: one(aiExperiences, {
    fields: [aiExperienceTools.aiExperienceId],
    references: [aiExperiences.id],
  }),
  tool: one(tools, {
    fields: [aiExperienceTools.toolId],
    references: [tools.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type AIExperience = typeof aiExperiences.$inferSelect;
export type NewAIExperience = typeof aiExperiences.$inferInsert;

export type AIExperienceTool = typeof aiExperienceTools.$inferSelect;
export type NewAIExperienceTool = typeof aiExperienceTools.$inferInsert;
