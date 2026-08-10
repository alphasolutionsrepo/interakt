// app/ai-experiences/_components/pipeline/pipeline.types.ts

/**
 * Shared shapes for the pipeline view.
 *
 * Extracted from PipelineStepsCard, which had grown past 1500 lines by holding the step
 * model, four diagrams, two editors and the card shell in one file.
 */

export type EditableField =
  | { type: 'toggle'; currentValue: boolean }
  | { type: 'number'; currentValue: number; min: number; max: number; unit: string }
  | { type: 'select'; currentValue: string; options: { label: string; value: string }[] };

export interface ConfigItem {
  label: string;
  value: string;
  editable?: EditableField & {
    /** Builds the partial update payload for updateExperience */
    buildPayload: (newValue: boolean | number | string) => Record<string, unknown>;
  };
}

export interface PipelineStep {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  /** Whether the step has user-configurable settings */
  configurable: boolean;
  /** Whether the step can be conditionally skipped */
  conditional?: boolean;
  /** Current config values to display */
  config?: ConfigItem[];
  /** Custom content rendered below config items (for complex editors) */
  customContent?: React.ReactNode;
  /** Phase tag shown as a badge */
  phase: 'safety' | 'context' | 'planning' | 'execution' | 'synthesis' | 'persistence';
}

export interface PipelineStepsCardProps {
  pipelineMode: string;
  personaConfig: Record<string, unknown>;
  sessionConfig: Record<string, unknown>;
  guardrailConfig?: Record<string, unknown> | null;
  onUpdate?: (payload: Record<string, unknown>) => Promise<void>;
  isUpdating?: boolean;
}

export interface GuardrailRule {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  action: 'block' | 'warn' | 'redact' | 'reroute';
  enabled: boolean;
  priority: number;
}

export const PHASE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  safety:      { bg: 'bg-red-500/10',    text: 'text-red-600 dark:text-red-400',       border: 'border-red-500/20' },
  context:     { bg: 'bg-sky-500/10',     text: 'text-sky-600 dark:text-sky-400',       border: 'border-sky-500/20' },
  planning:    { bg: 'bg-violet-500/10',  text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-500/20' },
  execution:   { bg: 'bg-orange-500/10',  text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/20' },
  synthesis:   { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/20' },
  persistence: { bg: 'bg-slate-500/10',   text: 'text-slate-600 dark:text-slate-400',   border: 'border-slate-500/20' },
};
