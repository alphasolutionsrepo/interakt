// src/features/prompt-templates/prompt-template.types.ts

/**
 * Prompt Template Types
 *
 * Re-exports DB types and defines DTOs for the prompt template feature.
 */

export type {
  PromptTemplate,
  NewPromptTemplate,
  PromptTemplateMetadata,
  PromptVariable,
  PromptSection,
  AiExperiencePromptOverride,
} from '@/db/schema/prompt-templates.schema';

/** The pipeline steps that have AI prompts. */
export type PromptTemplateStep =
  | 'turn_planner'
  | 'param_extraction'
  | 'response_synthesis'
  | 'response_synthesis_direct'
  | 'response_synthesis_lightweight'
  | 'agentic_loop';

/** A resolved template ready for rendering. */
export interface ResolvedTemplate {
  id: string;
  step: PromptTemplateStep;
  version: number;
  content: string;
  metadata: import('@/db/schema/prompt-templates.schema').PromptTemplateMetadata;
  isSystemDefault: boolean;
  /** Whether this was resolved from an experience override or the system default */
  source: 'override' | 'system_default';
}
