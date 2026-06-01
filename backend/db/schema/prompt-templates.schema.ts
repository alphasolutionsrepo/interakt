// db/schema/prompt-templates.schema.ts

/**
 * Prompt Templates Schema
 *
 * Production-grade prompt management for AI pipeline steps.
 * Each prompt template is a versioned artifact containing the full prompt text
 * with {{variable}} placeholders and editable section markers.
 *
 * Tables:
 * - prompt_templates: versioned prompt content (each row = one version)
 * - ai_experience_prompt_overrides: per-experience prompt version selection
 *
 * Design principles:
 * - Full prompt text (with scaffolding + placeholders) is the versioned artifact
 * - Admin edits instruction sections only; scaffolding is system-controlled
 * - Separate rows per version for clean audit trail and rollback
 * - Junction table for experience overrides (same pattern as tool assignments)
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  json,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import {
  promptTemplateStepEnum,
  promptTemplateStatusEnum,
} from './enums.schema';
import { aiExperiences } from './ai-experience.schema';

// ============================================================================
// TYPE DEFINITIONS (for JSON columns)
// ============================================================================

/** Metadata about a prompt template's variables and editable sections. */
export interface PromptTemplateMetadata {
  /** Variables available in this template ({{variable}} placeholders) */
  variables: PromptVariable[];
  /** Sections of the prompt, marking which are admin-editable */
  sections: PromptSection[];
}

/** A variable placeholder in a prompt template. */
export interface PromptVariable {
  /** Placeholder name, e.g. "toolList" */
  name: string;
  /** Human-readable description of what this variable injects */
  description: string;
  /** Where the value comes from at runtime */
  source: 'pipeline_context' | 'experience_config' | 'tool_schema' | 'action_results';
}

/** A section of the prompt template content. */
export interface PromptSection {
  /** Section identifier, e.g. "rules", "persona" */
  id: string;
  /** Human-readable label shown in admin UI */
  label: string;
  /** Start marker in the content, e.g. "<!-- section:rules -->" */
  startMarker: string;
  /** End marker in the content, e.g. "<!-- /section:rules -->" */
  endMarker: string;
  /** Whether admins can edit this section's content */
  editable: boolean;
}

// ============================================================================
// PROMPT TEMPLATES TABLE
// ============================================================================

export const promptTemplates = pgTable('prompt_templates', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** Which pipeline step this template is for */
  step: promptTemplateStepEnum('step').notNull(),

  /** Monotonically increasing version number within a step lineage */
  version: integer('version').notNull(),

  /** Parent version (null for v1 seed rows) */
  parentId: uuid('parent_id'),

  /** Human-readable label describing the change, e.g. "Relax Rule 8 for qualifiers" */
  label: varchar('label', { length: 255 }),

  /** The full prompt text with {{variable}} placeholders and section markers */
  content: text('content').notNull(),

  /** Metadata about variables and editable sections */
  metadata: json('metadata').$type<PromptTemplateMetadata>().notNull(),

  /** Template lifecycle status */
  status: promptTemplateStatusEnum('status').notNull().default('active'),

  /** Is this the current system default for its step? (exactly one per step) */
  isSystemDefault: boolean('is_system_default').notNull().default(false),

  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by'),
}, (table) => ({
  stepVersionIdx: index('pt_step_version_idx').on(table.step, table.version),
  stepStatusIdx: index('pt_step_status_idx').on(table.step, table.status),
  parentIdx: index('pt_parent_idx').on(table.parentId),
  createdAtIdx: index('pt_created_at_idx').on(table.createdAt),
}));

// ============================================================================
// AI EXPERIENCE PROMPT OVERRIDES TABLE (Junction)
// ============================================================================

export const aiExperiencePromptOverrides = pgTable('ai_experience_prompt_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** The experience using a custom prompt */
  aiExperienceId: uuid('ai_experience_id')
    .notNull()
    .references(() => aiExperiences.id, { onDelete: 'cascade' }),

  /** Which pipeline step this override applies to */
  step: promptTemplateStepEnum('step').notNull(),

  /** The specific template version to use */
  templateId: uuid('template_id')
    .notNull()
    .references(() => promptTemplates.id, { onDelete: 'restrict' }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'),
}, (table) => ({
  /** At most one override per step per experience */
  experienceStepUnique: unique('aepo_experience_step_unique')
    .on(table.aiExperienceId, table.step),
  experienceIdx: index('aepo_experience_idx').on(table.aiExperienceId),
  templateIdx: index('aepo_template_idx').on(table.templateId),
}));

// ============================================================================
// RELATIONS
// ============================================================================

export const promptTemplatesRelations = relations(promptTemplates, ({ one, many }) => ({
  parent: one(promptTemplates, {
    fields: [promptTemplates.parentId],
    references: [promptTemplates.id],
    relationName: 'versionChain',
  }),
  children: many(promptTemplates, { relationName: 'versionChain' }),
  experienceOverrides: many(aiExperiencePromptOverrides),
}));

export const aiExperiencePromptOverridesRelations = relations(aiExperiencePromptOverrides, ({ one }) => ({
  experience: one(aiExperiences, {
    fields: [aiExperiencePromptOverrides.aiExperienceId],
    references: [aiExperiences.id],
  }),
  template: one(promptTemplates, {
    fields: [aiExperiencePromptOverrides.templateId],
    references: [promptTemplates.id],
  }),
}));

// ============================================================================
// INFERRED TYPES
// ============================================================================

export type PromptTemplate = typeof promptTemplates.$inferSelect;
export type NewPromptTemplate = typeof promptTemplates.$inferInsert;
export type AiExperiencePromptOverride = typeof aiExperiencePromptOverrides.$inferSelect;
export type NewAiExperiencePromptOverride = typeof aiExperiencePromptOverrides.$inferInsert;
