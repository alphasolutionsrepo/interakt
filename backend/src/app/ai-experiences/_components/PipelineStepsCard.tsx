'use client';

/**
 * The pipeline view on an experience's detail page.
 *
 * Shows each step of the turn in order with its current settings, and hosts the editors that
 * are relational rather than form-shaped: guardrail rules and response presets save per
 * change, because batching a list edit behind a page-level Save would show state the server
 * does not have.
 *
 * Scalar settings deliberately do not live here. Tone and context window used to be editable
 * both here and on the edit page, which made a value depend on whichever screen was used
 * last; they are read-only now and owned by AI Configuration.
 */

import {
  ArrowDown, Bot, ChevronDown, ChevronRight, Database, Lock, Play, Save,
  Settings2, ShieldAlert, ShieldCheck, Sparkles,
} from 'lucide-react';
import { useState } from 'react';


import { GuardrailSubflowDiagram } from './pipeline/GuardrailDiagram';
import { PHASE_STYLES } from './pipeline/pipeline.types';
import type {
  ConfigItem,
  PipelineStep,
  PipelineStepsCardProps,
} from './pipeline/pipeline.types';
import { ResponsePresetsEditor } from './pipeline/ResponsePresetsEditor';
import {
  ContextAssemblyContent,
  ExecutionStepChainDiagram,
  TurnPlannerContent,
} from './pipeline/StepDiagrams';

import { Badge } from '@/components/ui/badge';
import { CollapsibleCard } from '@/shared/ui/custom/CollapsibleCard';

// ============================================================================
// BUILD STEPS FROM CONFIG
// ============================================================================

function buildSteps(props: PipelineStepsCardProps): PipelineStep[] {
  const { personaConfig, sessionConfig, guardrailConfig } = props;
  const inputGuardrail = guardrailConfig?.inputGuardrail as Record<string, unknown> | undefined;
  const outputGuardrail = guardrailConfig?.outputGuardrail as Record<string, unknown> | undefined;
  const responseFormats = personaConfig?.responseFormats as Record<string, unknown> | undefined;

  // Extract domain filter state for the subflow diagram
  const inputRules = (inputGuardrail?.rules as Array<Record<string, unknown>>) ?? [];
  const topicGateRule = inputRules.find(r => r.type === 'topic_gate');
  const domainFilterOn = (topicGateRule?.config as Record<string, unknown> | undefined)?.domainFilterEnabled === true;

  return [
    // S1: Input Guardrail
    {
      id: 's1',
      label: 'Input Guardrail',
      description: 'Evaluates the user message against content policy rules before processing. Blocks harmful or off-topic requests.',
      icon: ShieldCheck,
      iconColor: 'text-red-500',
      configurable: true,
      conditional: true,
      phase: 'safety',
      config: [
        {
          label: 'Status',
          value: inputGuardrail?.enabled ? 'Enabled' : 'Disabled',
        },
        ...(inputGuardrail?.enabled
          ? [{ label: 'Rules', value: `${(inputGuardrail?.rules as unknown[])?.length ?? 0} active` }]
          : []),
      ],
      // Rules are edited on the experience edit page; this view shows the resulting flow.
      ...(inputGuardrail?.enabled && {
        customContent: <GuardrailSubflowDiagram domainFilterEnabled={domainFilterOn} />,
      }),
    },

    // S2a: Session Load
    {
      id: 's2a',
      label: 'Session Load',
      description: 'Loads an existing session from the database or creates a new one. Retrieves conversation history and session state.',
      icon: Database,
      iconColor: 'text-sky-500',
      configurable: true,
      phase: 'context',
      config: [
        {
          label: 'Session TTL',
          value: `${sessionConfig?.sessionTtlMinutes ?? 1440} min`,
        },
        {
          label: 'Context Window',
          value: `${sessionConfig?.maxContextMessages ?? 20} messages`,
        },
        {
          label: 'Summary Threshold',
          value: `${sessionConfig?.summaryThreshold ?? 30} messages`,
        },
      ],
    },

    // S2b: Context Assembly
    {
      id: 's2b',
      label: 'Context Assembly',
      description: 'Builds the full context the AI sees for this turn. Resolves available tools with their schemas, loads persona instructions, and optionally retrieves episodic memories via semantic search.',
      icon: Database,
      iconColor: 'text-sky-500',
      configurable: true,
      phase: 'context',
      config: [],
      customContent: (
        <ContextAssemblyContent
          episodicEnabled={!!(sessionConfig?.enableUserContext ?? false)}
        />
      ),
    },

    // D1: Turn Planner
    {
      id: 'd1',
      label: 'Turn Planner',
      description: 'Single AI call that decides the action plan for this turn — which tools to call, in what order, and whether the user needs a direct response or clarification instead.',
      icon: Bot,
      iconColor: 'text-violet-500',
      configurable: true,
      phase: 'planning',
      config: [
        { label: 'AI Provider & Model', value: personaConfig?.model as string ?? 'System Default (set in experience config)' },
        { label: 'Temperature', value: '0.1 — low for consistent planning' },
      ],
      customContent: (
        <TurnPlannerContent />
      ),
    },

    // D2: Execution Loop
    {
      id: 'd2',
      label: 'Execution Loop',
      description: 'Iterates through planned actions sequentially. Each action flows through a tool-type-aware step chain with per-step observability.',
      icon: Play,
      iconColor: 'text-orange-500',
      configurable: true,
      phase: 'execution',
      config: [
        { label: 'Batch Size', value: '3 actions/turn' },
        { label: 'Max Retries', value: '1 per action' },
      ],
      customContent: (
        <ExecutionStepChainDiagram />
      ),
    },

    // D3: Response Synthesis
    {
      id: 'd3',
      label: 'Response Synthesis',
      description: 'Selects a UI preset based on results, then generates the final AI response incorporating tool results and persona voice.',
      icon: Sparkles,
      iconColor: 'text-emerald-500',
      configurable: true,
      phase: 'synthesis',
      config: [
        // Read-only here. Tone is owned by AI Configuration on the edit page; two editors
        // for one field is how a value silently depends on which screen you last used.
        {
          label: 'Tone',
          value: String(personaConfig?.tone ?? 'professional').replace(/^\w/, c => c.toUpperCase()),
        },
        { label: 'Max Response', value: responseFormats?.maxResponseLength ? `${responseFormats.maxResponseLength} tokens` : 'Default' },
        { label: 'Citations', value: (responseFormats?.enableCitations ?? true) ? String(responseFormats?.citationStyle ?? 'inline') : 'Disabled' },
      ],
      customContent: (
        <ResponsePresetsEditor
          enabledPresets={(responseFormats?.enabledPresets as string[]) ?? ['rich_text']}
          defaultPreset={(responseFormats?.defaultPreset as string) ?? 'rich_text'}
          editable={false}
        />
      ),
    },

    // S3: Output Guardrail
    {
      id: 's3',
      label: 'Output Guardrail',
      description: 'Evaluates the AI response against output policy rules before sending to the user. Can redact or block inappropriate responses.',
      icon: ShieldAlert,
      iconColor: 'text-red-500',
      configurable: true,
      conditional: true,
      phase: 'safety',
      config: [
        {
          label: 'Status',
          value: outputGuardrail?.enabled ? 'Enabled' : 'Disabled',
        },
        ...(outputGuardrail?.enabled
          ? [{ label: 'Rules', value: `${(outputGuardrail?.rules as unknown[])?.length ?? 0} active` }]
          : []),
      ],

    },

    // D4: Persistence
    {
      id: 'd4',
      label: 'Persistence',
      description: 'Saves the user message, AI response, tool results, and updated session state to the database.',
      icon: Save,
      iconColor: 'text-slate-500',
      configurable: false,
      phase: 'persistence',
    },

    // Post-turn: Memory & Summarization (fire-and-forget)
    {
      id: 'post',
      label: 'Post-Turn Tasks',
      description: 'Async background tasks: episodic memory extraction (learns user preferences) and conversation summarization (when threshold reached).',
      icon: Database,
      iconColor: 'text-slate-400',
      configurable: true,
      conditional: true,
      phase: 'persistence',
      config: [
        { label: 'Memory Extraction', value: 'On (when user identified)' },
        { label: 'Conversation Summary', value: 'Always on (triggers at threshold)' },
      ],
    },
  ];
}


// ============================================================================
// STEP ROW COMPONENT
// ============================================================================

// ============================================================================
// INLINE EDIT CONTROLS
// ============================================================================

function NumberControl({
  value,
  min,
  max,
  unit,
  onCommit,
  saving,
}: {
  value: number;
  min: number;
  max: number;
  unit: string;
  onCommit: (v: number) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  function handleCommit() {
    const parsed = parseInt(draft, 10);
    if (!isNaN(parsed) && parsed >= min && parsed <= max && parsed !== value) {
      onCommit(parsed);
    } else {
      setDraft(String(value));
    }
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        className="text-sm font-semibold mt-0.5 hover:text-primary transition-colors cursor-pointer"
        title="Click to edit"
      >
        {value} {unit}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleCommit(); if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); } }}
        onBlur={handleCommit}
        autoFocus
        disabled={saving}
        className="w-20 h-7 text-sm font-semibold rounded-md border border-border bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <span className="text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}

function SelectControl({
  value,
  options,
  onChange,
  saving,
}: {
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  saving: boolean;
}) {
  return (
    <select
      value={value}
      disabled={saving}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 text-sm font-semibold rounded-md border border-border bg-background px-2 mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// ============================================================================
// CONFIG ITEM RENDERER
// ============================================================================

function ConfigItemDisplay({
  item,
}: {
  item: ConfigItem;
}) {
  const [saving, setSaving] = useState(false);

  return (
    <div className="flex items-start gap-2 px-3 py-2">
      <span className="size-1.5 rounded-full bg-foreground/30 mt-2 shrink-0" />
      <div>
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{item.label}</p>
        <p className="text-sm text-foreground/80 mt-0.5">{item.value}</p>
      </div>
    </div>
  );
}

// ============================================================================
// STEP ROW COMPONENT
// ============================================================================

function StepRow({
  step,
  isLast,
  onUpdate,
}: {
  step: PipelineStep;
  isLast: boolean;
  onUpdate?: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasConfig = step.config && step.config.length > 0;
  const hasExpandable = hasConfig || !!step.customContent;
  const phaseStyle = PHASE_STYLES[step.phase];
  const Icon = step.icon;

  return (
    <div className="relative">
      {/* Connector line */}
      {!isLast && (
        <div className="absolute left-[19px] top-[40px] bottom-0 w-px bg-border/60" />
      )}

      <div className="relative flex gap-3 rounded-xl px-2 py-1.5 -mx-2 transition-colors group/step">
        {/* Step icon */}
        <div
          className={`relative z-10 flex size-10 shrink-0 items-center justify-center rounded-xl bg-background border border-border/60 shadow-sm transition-shadow ${hasExpandable ? 'cursor-pointer' : ''}`}
          onClick={() => hasExpandable && setExpanded(!expanded)}
        >
          <Icon className={`size-4.5 ${step.iconColor}`} />
        </div>

        {/* Step content */}
        <div className="flex-1 min-w-0 pb-6">
          {/* Header row — clickable to expand/collapse */}
          <div
            className={`flex items-center gap-2 w-full text-left group rounded-lg px-1.5 py-1 -mx-1.5 transition-colors ${hasExpandable ? 'cursor-pointer hover:bg-muted/50' : ''}`}
            onClick={() => hasExpandable && setExpanded(!expanded)}
            role={hasExpandable ? 'button' : undefined}
            tabIndex={hasExpandable ? 0 : undefined}
            onKeyDown={hasExpandable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } } : undefined}
          >
            <span className="text-[15px] font-semibold text-foreground">{step.label}</span>

            {/* Phase badge */}
            <Badge
              variant="outline"
              className={`rounded-md text-[11px] px-1.5 py-0 border ${phaseStyle.bg} ${phaseStyle.text} ${phaseStyle.border}`}
            >
              {step.phase}
            </Badge>

            {/* Conditional badge */}
            {step.conditional && (
              <Badge variant="outline" className="rounded-md text-[11px] px-1.5 py-0 border-dashed text-muted-foreground">
                conditional
              </Badge>
            )}

            {/* Lock icon for non-configurable */}
            {!step.configurable && (
              <Lock className="size-3.5 text-muted-foreground/50" />
            )}

            {/* Expand chevron */}
            {hasExpandable && (
              <span className="ml-auto text-muted-foreground group-hover:text-foreground transition-colors">
                {expanded
                  ? <ChevronDown className="size-4" />
                  : <ChevronRight className="size-4" />
                }
              </span>
            )}
          </div>

          {/* Description — also clickable to expand */}
          <p
            className={`text-sm text-muted-foreground mt-1.5 leading-relaxed pr-4 ${hasExpandable ? 'cursor-pointer' : ''}`}
            onClick={() => hasExpandable && setExpanded(!expanded)}
          >
            {step.description}
          </p>

          {/* Expanded config — clicks here do NOT toggle expand */}
          {expanded && (hasConfig || step.customContent) && (
            <div onClick={(e) => e.stopPropagation()}>
              {hasConfig && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {step.config!.map((item) => (
                    <ConfigItemDisplay key={item.label} item={item} />
                  ))}
                </div>
              )}
              {step.customContent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PipelineStepsCard(props: PipelineStepsCardProps) {
  const steps = buildSteps(props);
  const isStandardBudget = props.pipelineMode === 'deterministic';

  return (
    <CollapsibleCard
      icon={<Settings2 className="size-4 text-blue-500" />}
      title="How a turn runs"
      /*
        Two things were stale here. The labels still said Governed / Autonomous, which named
        the two chat engines this pipeline replaced — the budget presets are Standard and
        Thorough now, and "governed" belongs to the guardrail lock. And it invited the reader
        to "edit" a step, which this card stopped doing when configuration moved to the edit
        page; the steps expand to explain themselves and nothing more.
      */
      description={
        isStandardBudget
          ? 'Standard budget — every turn follows this sequence once, with a fixed tool budget. Click a step to see what it does.'
          : 'Thorough budget — the same sequence, but the assistant may revise its plan when an attempt returns nothing usable. Each attempt appears in the trace.'
      }
      headerExtras={
        <Badge variant="outline" className="rounded-lg text-xs font-mono shrink-0">
          {steps.length} steps
        </Badge>
      }
    >
      {/* Flow indicator */}
      <div className="flex items-center gap-2 mb-5 px-1">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">User Message</span>
        <ArrowDown className="size-3.5 text-muted-foreground" />
      </div>

      {/* Pipeline steps */}
      <div>
        {steps.map((step, i) => (
          <StepRow key={step.id} step={step} isLast={i === steps.length - 1} onUpdate={props.onUpdate} />
        ))}
      </div>

      {/* Flow indicator */}
      <div className="flex items-center gap-2 mt-2 px-1">
        <ArrowDown className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Response Delivered</span>
      </div>
    </CollapsibleCard>
  );
}
