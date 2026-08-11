'use client';

/** Read-only illustrations of what individual pipeline steps do. */

import { ArrowRight, Bot, CheckCircle2, FileText, Filter, RefreshCw, Search, Wrench,
} from 'lucide-react';


const ALWAYS_ON_FEATURES = [
  { label: 'Tool Resolution', detail: 'Loads schemas for all assigned tools' },
  { label: 'Persona & Tone', detail: 'Injected from experience config' },
  { label: 'Result Memory', detail: 'Resolves references like "item 2" or "that one"' },
];

export function ContextAssemblyContent({ episodicEnabled }: { episodicEnabled: boolean }) {
  return (
    <div className="mt-3 space-y-3">
      {/* Always-on features — compact inline list */}
      <div className="flex flex-wrap gap-2">
        {ALWAYS_ON_FEATURES.map((f) => (
          <div
            key={f.label}
            className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-3 py-2"
            title={f.detail}
          >
            <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-xs font-medium text-foreground">{f.label}</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">— {f.detail}</span>
          </div>
        ))}
      </div>

      {/* Episodic Memory — editable card with nested detail */}
      <div className="border border-border/50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Episodic Memory</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${episodicEnabled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
              {episodicEnabled ? 'Active' : 'Off'}
            </span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          {episodicEnabled
            ? 'Each turn, the user\u2019s message is embedded and matched against stored memories via semantic search. Top 3 relevant memories are injected into the AI\u2019s context.'
            : 'When enabled, the AI will recall past user preferences and interactions using semantic search. Adds an embedding call per turn.'
          }
        </p>
        {episodicEnabled && (
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-sky-500" /> Retrieval: cosine similarity</span>
            <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-sky-500" /> Top 3 per turn</span>
            <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-sky-500" /> Threshold: 0.45</span>
          </div>
        )}
      </div>
    </div>
  );
}


export function TurnPlannerContent() {
  return (
    <div className="mt-3 space-y-3">
      {/* What the planner receives */}
      <div className="border border-border/50 rounded-lg p-4 space-y-2">
        <span className="text-sm font-semibold text-foreground">Context sent to AI</span>
        <div className="flex flex-wrap gap-2">
          {[
            'User message',
            'Conversation history',
            'Session facts',
            'Tool summaries (no schemas)',
            'Result memory index',
            'Episodic memories',
          ].map((item) => (
            <span key={item} className="text-xs rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5 text-foreground/80">
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* What the planner outputs */}
      <div className="border border-border/50 rounded-lg p-4 space-y-2">
        <span className="text-sm font-semibold text-foreground">Plan output</span>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>Ordered action list (tool + intent)</span>
          <span>Dependency flags between actions</span>
          <span>Direct response / clarification routing</span>
          <span>Confidence score (0–1)</span>
        </div>
      </div>
    </div>
  );
}


const SEARCH_CHAIN_STEPS = [
  { id: 'context_enrichment', label: 'Enrich', description: 'Resolve valid filter values, sanitize invalid hints', icon: FileText, color: 'text-slate-500' },
  { id: 'param_extraction', label: 'Extract', description: 'AI extracts structured params using tool schema', icon: Bot, color: 'text-violet-500' },
  { id: 'filter_validation', label: 'Validate', description: 'Backend validates filter fields and values', icon: Filter, color: 'text-blue-500' },
  { id: 'tool_execution', label: 'Execute', description: 'Run the search with validated parameters', icon: Search, color: 'text-orange-500' },
  { id: 'zero_result_retry', label: 'Retry', description: 'Progressive relaxation on zero results', icon: RefreshCw, color: 'text-amber-500' },
  { id: 'result_capture', label: 'Capture', description: 'Store results for next actions and synthesis', icon: CheckCircle2, color: 'text-green-500' },
] as const;

const DEFAULT_CHAIN_STEPS = [
  { id: 'param_extraction', label: 'Extract', description: 'AI extracts structured params using tool schema', icon: Bot, color: 'text-violet-500' },
  { id: 'tool_execution', label: 'Execute', description: 'Run the tool with validated parameters', icon: Wrench, color: 'text-orange-500' },
  { id: 'result_capture', label: 'Capture', description: 'Store results for next actions and synthesis', icon: CheckCircle2, color: 'text-green-500' },
] as const;

export function ExecutionStepChainDiagram() {
  return (
    <div className="space-y-4">
      {/* Search tools chain */}
      <div>
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
          Search tools <span className="font-normal">(data_source:search)</span>
        </p>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {SEARCH_CHAIN_STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.id} className="flex items-center gap-1 min-w-0">
                {i > 0 && <ArrowRight className="size-3 text-muted-foreground/40 shrink-0" />}
                <div className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1.5 min-w-0" title={step.description}>
                  <Icon className={`size-3 shrink-0 ${step.color}`} />
                  <span className="text-[11px] font-medium whitespace-nowrap">{step.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Default tools chain */}
      <div>
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
          Other tools <span className="font-normal">(http, lookup, mcp, etc.)</span>
        </p>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {DEFAULT_CHAIN_STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.id} className="flex items-center gap-1 min-w-0">
                {i > 0 && <ArrowRight className="size-3 text-muted-foreground/40 shrink-0" />}
                <div className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1.5 min-w-0" title={step.description}>
                  <Icon className={`size-3 shrink-0 ${step.color}`} />
                  <span className="text-[11px] font-medium whitespace-nowrap">{step.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/60">
        Each step produces its own trace span for per-step observability.
      </p>
    </div>
  );
}

