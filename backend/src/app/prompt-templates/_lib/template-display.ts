// app/prompt-templates/_lib/template-display.ts

/**
 * Display metadata for prompt template steps, statuses and variable sources.
 *
 * Shared rather than duplicated per component: the page and every card it renders label the
 * same steps, and a second copy is how two screens end up disagreeing about what a step is
 * called.
 */

import { Archive, CheckCircle2, Clock } from 'lucide-react';

// ============================================================================
// STEP LABELS
// ============================================================================

export const STEP_LABELS: Record<string, { label: string; color: string }> = {
  turn_planner: { label: 'Turn Planner', color: 'bg-blue-500/10 text-blue-600' },
  param_extraction: { label: 'Param Extraction', color: 'bg-amber-500/10 text-amber-600' },
  response_synthesis: { label: 'Response Synthesis', color: 'bg-green-500/10 text-green-600' },
  response_synthesis_direct: { label: 'Direct Response', color: 'bg-purple-500/10 text-purple-600' },
  response_synthesis_lightweight: { label: 'Lightweight Response', color: 'bg-pink-500/10 text-pink-600' },
  agentic_loop: { label: 'Agentic Loop', color: 'bg-cyan-500/10 text-cyan-600' },
};

export const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  active: { icon: CheckCircle2, color: 'text-green-500', label: 'Active' },
  draft: { icon: Clock, color: 'text-amber-500', label: 'Draft' },
  archived: { icon: Archive, color: 'text-muted-foreground', label: 'Archived' },
};

export const SOURCE_COLORS: Record<string, string> = {
  pipeline_context: 'bg-blue-500/10 text-blue-600 border-blue-200',
  experience_config: 'bg-green-500/10 text-green-600 border-green-200',
  tool_schema: 'bg-amber-500/10 text-amber-600 border-amber-200',
  action_results: 'bg-purple-500/10 text-purple-600 border-purple-200',
};
