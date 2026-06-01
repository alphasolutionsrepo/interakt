// ============================================================================
// Chat Experience Types
// ============================================================================

import type { ToolDisplayConfig } from './preset-renderers';

export type { ToolDisplayConfig };

export interface ChatExperienceMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  isGeneratingResponse?: boolean;
  pipelineStep?: string;
  preset?: string;
  presetPayload?: {
    items: Array<{ id?: string; fields: Record<string, unknown> }>;
    displayConfig: ToolDisplayConfig;
  };
  toolCalls?: Array<{
    id: string;
    name: string;
    status: 'pending' | 'completed' | 'failed';
    durationMs?: number;
  }>;
  /** Sub-steps within the execution loop (context enrichment, param extraction, etc.) */
  actionSteps?: ActionStepEntry[];
}

/** A sub-step event from the execution loop */
export interface ActionStepEntry {
  toolSlug: string;
  step: string;
  durationMs: number;
  detail?: string;
}

// SSE event types returned by the pipeline
export type ChatSSEEvent =
  | { type: 'step_start'; stepName: string }
  | { type: 'step_complete'; stepName: string }
  | { type: 'response_start' }
  | { type: 'preset'; preset: string; data: { items: Array<{ id?: string; fields: Record<string, unknown> }>; displayConfig: ToolDisplayConfig } }
  | { type: 'content'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; success: boolean; durationMs: number }
  | { type: 'action_step'; toolSlug: string; step: string; durationMs: number; detail?: string }
  | { type: 'done'; sessionId: string; usage: Record<string, unknown> }
  | { type: 'error'; message: string };
