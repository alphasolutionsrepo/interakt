// src/features/sessions/sessions.validation.ts

import { z } from 'zod';

// ============================================================================
// CONSTANTS
// ============================================================================

export const SESSION_MESSAGE_ROLES = ['user', 'assistant', 'system', 'tool_result'] as const;
export const SESSION_STATUSES = ['active', 'expired', 'archived'] as const;

// ============================================================================
// MESSAGE METADATA SCHEMA
// ============================================================================

const toolCallSchema = z.object({
  toolId: z.string().min(1),
  toolName: z.string().min(1),
  input: z.unknown(),
  durationMs: z.number().int().min(0).optional(),
});

const tokenUsageSchema = z.object({
  promptTokens: z.number().int().min(0),
  completionTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
});

const stepTraceEntrySchema = z.object({
  stepId: z.string().min(1),
  stepType: z.string().min(1),
  durationMs: z.number().int().min(0),
  status: z.enum(['success', 'skipped', 'error']),
});

const responseDataSchema = z.object({
  preset: z.string().min(1),
  content: z.unknown(),
});

export const messageMetadataSchema = z.object({
  toolCalls: z.array(toolCallSchema).optional(),
  tokenUsage: tokenUsageSchema.optional(),
  latencyMs: z.number().int().min(0).optional(),
  stepTrace: z.array(stepTraceEntrySchema).optional(),
  responseData: responseDataSchema.optional(),
});

// ============================================================================
// USER CONTEXT SCHEMA
// ============================================================================

export const userContextSchema = z.object({
  userId: z.string().min(1).optional(),
  displayName: z.string().max(255).optional(),
  preferences: z.record(z.unknown()).optional(),
  permissions: z.array(z.string()).optional(),
});

// ============================================================================
// LAST TOOL RESULTS SCHEMA
// ============================================================================

const toolResultEntrySchema = z.object({
  toolId: z.string().min(1),
  toolName: z.string().min(1),
  result: z.unknown(),
  executedAt: z.string().datetime(),
});

export const lastToolResultsSchema = z.record(toolResultEntrySchema);

// ============================================================================
// CREATE SESSION
// ============================================================================

export const createSessionSchema = z.object({
  aiExperienceId: z.string().uuid('Invalid AI Experience ID'),

  /** Optional client metadata (device info, page URL, etc.) */
  clientMetadata: z.record(z.unknown()).optional(),

  /** Optional user context (Phase 3 — identity) */
  userContext: userContextSchema.optional(),

  /** TTL in minutes (from experience's sessionConfig) — set by service, not client */
  ttlMinutes: z.number().int().min(1).max(43_200),
});

export type CreateSessionDTO = z.infer<typeof createSessionSchema>;

// ============================================================================
// ADD MESSAGE
// ============================================================================

export const addMessageSchema = z.object({
  role: z.enum(SESSION_MESSAGE_ROLES),
  content: z.string().min(1, 'Message content cannot be empty'),
  metadata: messageMetadataSchema.optional(),
});

export type AddMessageDTO = z.infer<typeof addMessageSchema>;

// ============================================================================
// UPDATE SESSION (for pipeline state, facts, summary, tool results)
// ============================================================================

export const updateSessionSchema = z.object({
  summary: z.string().optional(),
  facts: z.record(z.unknown()).optional(),
  pipelineState: z.record(z.record(z.unknown())).optional(),
  lastToolResults: lastToolResultsSchema.optional(),
  userContext: userContextSchema.optional(),
  status: z.enum(SESSION_STATUSES).optional(),
  summarizedUpTo: z.number().int().min(0).optional(),
}).refine(
  (data) => Object.keys(data).some(k => data[k as keyof typeof data] !== undefined),
  { message: 'At least one field must be provided' },
);

export type UpdateSessionDTO = z.infer<typeof updateSessionSchema>;

// ============================================================================
// LIST SESSIONS QUERY
// ============================================================================

export const listSessionsQuerySchema = z.object({
  aiExperienceId: z.string().uuid().optional(),
  status: z.enum(SESSION_STATUSES).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  sortBy: z.enum(['createdAt', 'lastActiveAt']).default('lastActiveAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;
