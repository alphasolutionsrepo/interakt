// src/features/prompt-templates/prompt-template.validation.ts

import { z } from 'zod';

// ============================================================================
// CONSTANTS
// ============================================================================

export const PROMPT_TEMPLATE_STEPS = [
  'turn_planner',
  'param_extraction',
  'response_synthesis',
  'response_synthesis_direct',
  'response_synthesis_lightweight',
  'agentic_loop',
] as const;

export const PROMPT_TEMPLATE_STATUSES = ['draft', 'active', 'archived'] as const;

// ============================================================================
// LIST QUERY
// ============================================================================

export const listTemplatesQuerySchema = z.object({
  step: z.enum(PROMPT_TEMPLATE_STEPS).optional(),
  status: z.enum(PROMPT_TEMPLATE_STATUSES).optional(),
});

export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;

// ============================================================================
// CREATE VERSION
// ============================================================================

export const createVersionSchema = z.object({
  parentId: z.string().uuid('Valid parent template ID is required'),
  content: z.string().min(1, 'Content is required'),
  label: z.string().max(255).optional(),
  metadata: z.object({
    variables: z.array(z.object({
      name: z.string().min(1),
      description: z.string(),
      source: z.enum(['pipeline_context', 'experience_config', 'tool_schema', 'action_results']),
    })),
    sections: z.array(z.object({
      id: z.string().min(1),
      label: z.string(),
      startMarker: z.string(),
      endMarker: z.string(),
      editable: z.boolean(),
    })),
  }).optional(),
});

export type CreateVersionDTO = z.infer<typeof createVersionSchema>;

// ============================================================================
// ROLLBACK
// ============================================================================

export const rollbackSchema = z.object({
  targetVersionId: z.string().uuid('Valid target version ID is required'),
});

export type RollbackDTO = z.infer<typeof rollbackSchema>;

// ============================================================================
// EXPERIENCE OVERRIDE
// ============================================================================

export const setExperienceOverrideSchema = z.object({
  step: z.enum(PROMPT_TEMPLATE_STEPS),
  templateId: z.string().uuid('Valid template ID is required'),
});

export type SetExperienceOverrideDTO = z.infer<typeof setExperienceOverrideSchema>;

export const removeExperienceOverrideParamsSchema = z.object({
  step: z.enum(PROMPT_TEMPLATE_STEPS),
});
