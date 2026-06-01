// src/features/ai-experience/ai-experience.validation.ts

import { z } from 'zod';

// ============================================================================
// CONSTANTS
// ============================================================================

export const PIPELINE_MODES = ['agentic', 'deterministic'] as const;

export const TONES = ['professional', 'friendly', 'casual', 'enthusiastic', 'concise'] as const;

export const RESPONSE_PRESETS = [
  'rich_text',
  'markdown_rich', // legacy alias for rich_text (V1 pipeline)
  'single_card',
  'item_grid',
  'item_list',
  'comparison_table',
  'step_list',
  'summary_with_sources',
] as const;

export const CITATION_STYLES = ['inline', 'footnote', 'none'] as const;

export const TELEMETRY_LEVELS = ['off', 'metadata', 'full'] as const;

export const GUARDRAIL_ACTIONS = ['block', 'warn', 'redact', 'reroute'] as const;

export const GUARDRAIL_RULE_TYPES = [
  'topic_gate',
  'blocklist',
  'allowlist',
  'regex_filter',
  'pii_detection',
  'content_policy',
  'max_length',
  'language_filter',
  'llm_judge',
] as const;

// ============================================================================
// PERSONA CONFIG SCHEMA
// ============================================================================

const responseFormatsSchema = z.object({
  enabledPresets: z.array(z.enum(RESPONSE_PRESETS)).min(1),
  defaultPreset: z.enum(RESPONSE_PRESETS),
  maxResponseLength: z.number().int().min(50).max(32_000).optional(),
  enableCitations: z.boolean(),
  citationStyle: z.enum(CITATION_STYLES),
});

export const personaConfigSchema = z.object({
  name: z.string().max(100).optional(),
  avatarUrl: z.string().url().optional(),
  tone: z.enum(TONES),
  systemInstructions: z.string().min(10).max(10_000),
  focusAreas: z.array(z.string().max(100)).max(20).optional(),
  avoidTopics: z.array(z.string().max(100)).max(20).optional(),
  businessDomains: z.array(z.string().max(100)).max(10).optional(),
  responseFormats: responseFormatsSchema,
});

// ============================================================================
// GUARDRAIL CONFIG SCHEMA
// ============================================================================

const guardrailRuleSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  type: z.enum(GUARDRAIL_RULE_TYPES),
  config: z.record(z.unknown()),
  action: z.enum(GUARDRAIL_ACTIONS),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(1000),
});

export const guardrailConfigSchema = z.object({
  inputGuardrail: z.object({
    enabled: z.boolean(),
    rules: z.array(guardrailRuleSchema),
    onBlock: z.object({
      message: z.string().min(1).max(500),
    }),
  }),
  outputGuardrail: z.object({
    enabled: z.boolean(),
    rules: z.array(guardrailRuleSchema),
    onBlock: z.object({
      message: z.string().min(1).max(500),
    }),
  }),
});

// ============================================================================
// SESSION CONFIG SCHEMA
// ============================================================================

export const sessionConfigSchema = z.object({
  sessionTtlMinutes: z.number().int().min(1).max(43_200).default(1440),
  maxSessionsPerUser: z.number().int().min(1).max(100).optional(),
  maxContextMessages: z.number().int().min(1).max(100).default(20),
  enableConversationSummary: z.boolean().default(false),
  summaryThreshold: z.number().int().min(5).max(100).default(30),
  enableUserContext: z.boolean().default(false),
});

// ============================================================================
// ACCESS CONFIG SCHEMA
// ============================================================================

const rateLimitsSchema = z.object({
  chatPerMinute: z.number().int().min(1).max(1000).default(30),
  requestsPerDay: z.number().int().min(1).max(1_000_000).default(10_000),
});

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Must be hex color')
  .optional();

const embedConfigSchema = z.object({
  widgetTheme: z.enum(['light', 'dark', 'auto']),
  /** @deprecated use launcher + placement. Retained for backward compatibility. */
  widgetPosition: z.enum(['bottom-right', 'bottom-left', 'inline']),
  launcher: z.enum(['floating', 'inline', 'button']).optional(),
  placement: z
    .enum(['bottom-right', 'bottom-left', 'top-right', 'top-left'])
    .optional(),
  primaryColor: hexColor,
  backgroundColor: hexColor,
  surfaceColor: hexColor,
  /** CSS length — digits + unit, e.g. "12px", "1rem", or bare "0". */
  borderRadius: z
    .string()
    .regex(/^(0|\d+(\.\d+)?(px|rem|em))$/i, 'Must be a CSS length like "12px" or "0"')
    .max(16)
    .optional(),
  fontFamily: z.string().max(256).optional(),
  logoUrl: z.string().url().max(2048).optional(),
  welcomeMessage: z.string().max(500).optional(),
  welcomeDescription: z.string().max(500).optional(),
  suggestedQuestions: z.array(z.string().max(200)).max(5).optional(),
  placeholder: z.string().max(200).optional(),
  showBranding: z.boolean(),
});

export const accessConfigSchema = z.object({
  allowedOrigins: z.array(z.string().url()).default([]),
  rateLimits: rateLimitsSchema,
  embedConfig: embedConfigSchema.optional(),
});

// ============================================================================
// OBSERVABILITY CONFIG SCHEMA
// ============================================================================

export const observabilityConfigSchema = z.object({
  telemetryDetailLevel: z.enum(TELEMETRY_LEVELS).default('off'),
  enableConversationLogging: z.boolean().default(true),
  conversationRetentionDays: z.number().int().min(1).max(365).default(90),
});

// ============================================================================
// PIPELINE CONFIG SCHEMA (light validation — step-level validated elsewhere)
// ============================================================================

const stepConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['eq', 'neq', 'gt', 'lt', 'in', 'exists']),
  value: z.unknown(),
});

const pipelineStepSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.string().min(1),
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  config: z.record(z.unknown()),
  enabled: z.boolean(),
  order: z.number().int().min(0),
  conditions: z.array(stepConditionSchema).optional(),
  onFailure: z.enum(['abort', 'skip', 'fallback']).optional(),
  fallbackConfig: z.record(z.unknown()).optional(),
});

const pipelineSettingsSchema = z.object({
  maxTotalDurationMs: z.number().int().min(1000).max(120_000).default(30_000),
  enableTracing: z.boolean().default(true),
  onStepFailure: z.enum(['abort', 'skip', 'fallback']).default('abort'),
});

export const pipelineConfigSchema = z.object({
  mode: z.enum(PIPELINE_MODES),
  steps: z.array(pipelineStepSchema),
  settings: pipelineSettingsSchema,
});

// ============================================================================
// CREATE AI EXPERIENCE
// ============================================================================

export const createAIExperienceSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name must be 255 characters or less'),

  slug: z.string()
    .min(1, 'Slug is required')
    .max(100, 'Slug must be 100 characters or less')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug must be lowercase with hyphens only',
    ),

  description: z.string().max(1000).nullish().transform(v => v ?? undefined),
  icon: z.string().max(100).nullish().transform(v => v ?? undefined),

  pipelineMode: z.enum(PIPELINE_MODES).default('deterministic'),
  pipelineConfig: pipelineConfigSchema.optional(),

  personaConfig: personaConfigSchema,

  guardrailConfig: guardrailConfigSchema.optional(),

  sessionConfig: sessionConfigSchema,

  accessConfig: accessConfigSchema,

  observabilityConfig: observabilityConfigSchema,

  /** AI provider selection (null = system default) */
  providerId: z.string().uuid().nullish().transform(v => v ?? undefined),
  modelId: z.number().int().nullish().transform(v => v ?? undefined),

  /** Tool IDs to assign on creation */
  toolIds: z.array(z.string().uuid()).optional().default([]),
});

export type CreateAIExperienceDTO = z.infer<typeof createAIExperienceSchema>;

// ============================================================================
// UPDATE AI EXPERIENCE
// ============================================================================

export const updateAIExperienceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullish().transform(v => v ?? undefined),
  icon: z.string().max(100).nullish().transform(v => v ?? undefined),

  pipelineMode: z.enum(PIPELINE_MODES).optional(),
  pipelineConfig: pipelineConfigSchema.optional(),

  personaConfig: personaConfigSchema.optional(),

  guardrailConfig: guardrailConfigSchema.nullable().optional(),

  sessionConfig: sessionConfigSchema.optional(),

  accessConfig: accessConfigSchema.optional(),

  observabilityConfig: observabilityConfigSchema.optional(),

  providerId: z.string().uuid().nullable().optional(),
  modelId: z.number().int().nullable().optional(),

  isActive: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).some(k => data[k as keyof typeof data] !== undefined),
  { message: 'At least one field must be provided' },
);

export type UpdateAIExperienceDTO = z.infer<typeof updateAIExperienceSchema>;

// ============================================================================
// TOOL ASSIGNMENT SCHEMAS
// ============================================================================

export const assignToolSchema = z.object({
  toolId: z.string().uuid('Invalid tool ID'),
  overrideAiDescription: z.string().max(2000).nullish().transform(v => v ?? undefined),
  overrideConfig: z.record(z.unknown()).nullish().transform(v => v ?? undefined),
  isEnabled: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).optional().default(0),
});

export type AssignToolDTO = z.infer<typeof assignToolSchema>;

export const updateToolAssignmentSchema = z.object({
  overrideAiDescription: z.string().max(2000).nullish().transform(v => v ?? undefined),
  overrideConfig: z.record(z.unknown()).nullish().transform(v => v ?? undefined),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type UpdateToolAssignmentDTO = z.infer<typeof updateToolAssignmentSchema>;

// ============================================================================
// QUERY SCHEMAS
// ============================================================================

export const listAIExperiencesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  search: z.string().max(255).nullish().transform(v => v ?? undefined),
  isActive: z.enum(['true', 'false']).optional().transform(v => v === 'true' ? true : v === 'false' ? false : undefined),
  pipelineMode: z.enum(PIPELINE_MODES).optional(),
  sortBy: z.enum(['name', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListAIExperiencesQuery = z.infer<typeof listAIExperiencesQuerySchema>;
