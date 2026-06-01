'use client';

/**
 * TurnTimeline
 *
 * Shows a single conversation turn as a readable narrative story:
 *   User said X → AI decided to call tool Y → Tool returned Z results → AI responded with ...
 *
 * "AI Embeddings" spans are shown inline as "Vector search" under the tool that triggered them,
 * not as mysterious top-level items.
 */

import { useCallback, useState } from 'react';
import {
  Bot,
  Wrench,
  MessageSquare,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Zap,
  Search,
  X,
  Maximize2,
  Copy,
  Check,
  FileText,
  ShieldCheck,
  RefreshCw,
  Filter,
  ArrowRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { SpanListItem, SpanDetail } from '../_lib/api-client';
import { useTraceSpans } from '../_lib/hooks/useTraces';

// ─────────────────────────────────────────────────────────────────────────────
// Copy utility
// ─────────────────────────────────────────────────────────────────────────────

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, []);
  return { copy, copied };
}

function CopyButton({ text, title = 'Copy', className }: { text: string; title?: string; className?: string }) {
  const { copy, copied } = useCopy();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('size-6 shrink-0', className)}
      title={title}
      onClick={(e) => { e.stopPropagation(); copy(text); }}
    >
      {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
    </Button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SearchSubStep {
  span: SpanDetail;
  /** The search_query embedding nested inside this search.execute span, if any */
  queryEmbedding: SpanDetail | null;
}

type TimelineStep =
  | { kind: 'ai_decision'; span: SpanDetail; toolCallsRequested: Array<{ name: string; input: unknown }> }
  | { kind: 'ai_response'; span: SpanDetail; text: string }
  | { kind: 'tool_call'; span: SpanDetail; searches: SearchSubStep[]; toolInput: unknown }
  | { kind: 'embedding'; span: SpanDetail } // standalone embedding (rare)
  // V2 deterministic pipeline phases
  | { kind: 'v2_phase'; span: SpanDetail; phase: string; label: string; children: TimelineStep[]; actionStepSpans?: SpanDetail[] }
  // V2 guardrail step (with optional child sub-stages)
  | { kind: 'guardrail'; span: SpanDetail; classification: string; debug: Record<string, unknown>; shortCircuited: boolean; children: TimelineStep[] };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmt(ms: number) {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function tryParseJSON<T>(raw: unknown): T | null {
  try { return JSON.parse(String(raw)) as T; } catch { return null; }
}

function getAttr(span: SpanDetail, key: string): string | undefined {
  const v = span.attributes?.[key];
  return v != null ? String(v) : undefined;
}

function getEvent(span: SpanDetail, name: string) {
  return span.events?.find((e) => e.name === name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Narrative builder
// ─────────────────────────────────────────────────────────────────────────────

function withinWindow(childStart: number, parentStart: number, parentEnd: number): boolean {
  return childStart >= parentStart && childStart <= parentEnd;
}

function buildNarrative(spans: SpanDetail[]): TimelineStep[] {
  const sorted = [...spans].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  // V2 deterministic pipeline emits `pipeline.v2.*` phase spans; if those are
  // missing, this is an agentic-mode turn and needs its own narrative builder.
  const isV2 = sorted.some((s) => s.operationName.startsWith('pipeline.v2.'));
  return isV2 ? buildV2Narrative(sorted) : buildAgenticNarrative(sorted);
}

// ─────────────────────────────────────────────────────────────────────────────
// Agentic-mode narrative builder
//
// Agentic turns don't have `pipeline.v2.*` phase spans. Instead we walk the AI
// and tool spans that sit under `pipeline.step.agentic_loop` and emit them as
// a flat interleaved sequence, with the embedded model/tool calls. This keeps
// the same step kinds (`tool_call`, `ai_response`) so existing renderers work.
// ─────────────────────────────────────────────────────────────────────────────

function buildAgenticNarrative(sorted: SpanDetail[]): TimelineStep[] {
  const agenticParent = sorted.find((s) => s.operationName === 'pipeline.step.agentic_loop');
  if (!agenticParent) return [];

  const pStart = new Date(agenticParent.startTime).getTime();
  const pEnd = new Date(agenticParent.endTime).getTime();
  const within = (s: SpanDetail) => withinWindow(new Date(s.startTime).getTime(), pStart, pEnd);

  const aiSpans = sorted.filter((s) => (s.operationName === 'ai.chat' || s.operationName === 'ai.stream_chat') && within(s));
  const toolSpans = sorted.filter((s) => s.operationName === 'tool.execute' && within(s));

  const interleaved: TimelineStep[] = [
    ...aiSpans.map((s): TimelineStep => {
      const responseEvent = getEvent(s, 'ai.response');
      const text = responseEvent ? String(responseEvent.attributes.text ?? '') : '';
      const rawToolCalls = responseEvent?.attributes.tool_calls;
      const toolCalls = rawToolCalls
        ? tryParseJSON<Array<{ name: string; input: unknown }>>(rawToolCalls) ?? []
        : [];
      return toolCalls.length > 0
        ? { kind: 'ai_decision', span: s, toolCallsRequested: toolCalls }
        : { kind: 'ai_response', span: s, text };
    }),
    ...toolSpans.map((s): TimelineStep => {
      const inputParamsAttr = s.attributes?.['alpha.tool.input_params'];
      const toolInput = inputParamsAttr ? tryParseJSON(String(inputParamsAttr)) : null;
      return { kind: 'tool_call', span: s, searches: [], toolInput };
    }),
  ].sort((a, b) => {
    const aSpan = 'span' in a ? a.span : null;
    const bSpan = 'span' in b ? b.span : null;
    if (!aSpan || !bSpan) return 0;
    return new Date(aSpan.startTime).getTime() - new Date(bSpan.startTime).getTime();
  });

  return interleaved;
}

// ─────────────────────────────────────────────────────────────────────────────
// V2 Deterministic Pipeline narrative builder
// ─────────────────────────────────────────────────────────────────────────────

const V2_PHASE_LABELS: Record<string, string> = {
  'pipeline.v2.input_guardrail': 'Input guardrail',
  'pipeline.v2.context_assembly': 'Context loaded',
  'pipeline.v2.turn_planner': 'Plan',
  'pipeline.v2.execution_loop': 'Execute',
  'pipeline.v2.response_synthesis': 'Synthesize',
  'pipeline.v2.persistence': 'Persist',
};

const GUARDRAIL_STAGE_LABELS: Record<string, string> = {
  'pipeline.v2.guardrail.blocklist_check': 'Blocklist check',
  'pipeline.v2.guardrail.greeting_detection': 'Greeting detection',
  'pipeline.v2.guardrail.domain_filter': 'Domain filter',
  'pipeline.v2.guardrail.lightweight_synthesis': 'Lightweight synthesis',
};

const CLASSIFICATION_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  blocked: { bg: 'bg-red-500/10', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' },
  greeting: { bg: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  general: { bg: 'bg-sky-500/10', text: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
  off_topic: { bg: 'bg-slate-500/10', text: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-400' },
  domain: { bg: 'bg-violet-500/10', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
};

function buildV2Narrative(sorted: SpanDetail[]): TimelineStep[] {
  // Collect V2 phase spans and child spans
  const guardrailSpans = ['pipeline.v2.input_guardrail', 'pipeline.v2.guardrail.blocklist_check', 'pipeline.v2.guardrail.greeting_detection', 'pipeline.v2.guardrail.domain_filter', 'pipeline.v2.guardrail.lightweight_synthesis'];
  const actionStepSpans = sorted.filter((s) => s.operationName.startsWith('pipeline.v2.action.'));
  const phaseSpans = sorted.filter((s) => s.operationName.startsWith('pipeline.v2.') && s.operationName !== 'pipeline.v2.turn' && !guardrailSpans.includes(s.operationName) && !s.operationName.startsWith('pipeline.v2.action.'));
  const aiSpans = sorted.filter((s) => s.operationName === 'ai.chat' || s.operationName === 'ai.stream_chat');
  const toolSpans = sorted.filter((s) => s.operationName === 'tool.execute');
  const searchSpans = sorted.filter((s) => s.operationName === 'search.execute');
  const embeddingSpans = sorted.filter((s) => s.operationName === 'ai.generate_embeddings');

  const steps: TimelineStep[] = [];

  // ── Guardrail step (always first if present) ──────────────────────────
  const guardrailParent = sorted.find((s) => s.operationName === 'pipeline.v2.input_guardrail');
  const hasFullPipeline = sorted.some((s) => s.operationName === 'pipeline.v2.turn');
  if (guardrailParent) {
    const classification = String(guardrailParent.attributes?.['alpha.v2.guardrail.classification'] ?? 'domain');
    // Short-circuited = non-domain AND the full pipeline didn't run
    const shortCircuited = classification !== 'domain' && !hasFullPipeline;
    const debug: Record<string, unknown> = {};
    const attrs = guardrailParent.attributes ?? {};
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('alpha.v2.guardrail.')) debug[k] = v;
    }

    // Collect child sub-stage spans
    const subStageSpans = sorted.filter((s) => s.operationName.startsWith('pipeline.v2.guardrail.'));
    const children: TimelineStep[] = subStageSpans.map((s) => ({
      kind: 'v2_phase' as const,
      span: s,
      phase: s.operationName.replace('pipeline.v2.guardrail.', ''),
      label: GUARDRAIL_STAGE_LABELS[s.operationName] ?? s.operationName,
      children: [],
    }));

    steps.push({ kind: 'guardrail', span: guardrailParent, classification, debug, shortCircuited, children });

    // If short-circuited, add the lightweight synthesis AI call as a separate step so it's visible
    if (shortCircuited && phaseSpans.length === 0) {
      const lightweightAi = sorted.find(
        (s) => (s.operationName === 'ai.chat' || s.operationName === 'ai.stream_chat')
          && s.attributes?.['alpha.ai.feature'] === 'lightweight-synthesis',
      );
      if (lightweightAi) {
        // Response text lives on the lightweight_synthesis span, not on the ai.chat span
        const synthSpan = sorted.find((s) => s.operationName === 'pipeline.v2.guardrail.lightweight_synthesis');
        const responseText = (synthSpan?.attributes?.['alpha.v2.guardrail.response_text'] as string)
          ?? (lightweightAi.attributes?.['alpha.ai.response_text'] as string)
          ?? '';
        steps.push({ kind: 'ai_response', span: lightweightAi, text: responseText });
      }
      return steps;
    }
  }

  for (const phase of phaseSpans) {
    const pStart = new Date(phase.startTime).getTime();
    const pEnd = new Date(phase.endTime).getTime();
    const label = V2_PHASE_LABELS[phase.operationName] ?? phase.operationName;
    const phaseName = phase.operationName.replace('pipeline.v2.', '');

    // Find child spans within this phase's time window
    const childAi = aiSpans.filter((s) => withinWindow(new Date(s.startTime).getTime(), pStart, pEnd));
    const childTools = toolSpans.filter((s) => withinWindow(new Date(s.startTime).getTime(), pStart, pEnd));
    const childSearches = searchSpans.filter((s) => withinWindow(new Date(s.startTime).getTime(), pStart, pEnd));
    const childEmbeddings = embeddingSpans.filter((s) => withinWindow(new Date(s.startTime).getTime(), pStart, pEnd));

    // Build child steps
    const children: TimelineStep[] = [];

    if (phaseName === 'turn_planner') {
      // Show the AI call that produced the plan
      for (const ai of childAi) {
        const responseEvent = getEvent(ai, 'ai.response');
        const rawToolCalls = responseEvent?.attributes.tool_calls;
        const toolCalls = rawToolCalls ? tryParseJSON<Array<{ name: string; input: unknown }>>(rawToolCalls) ?? [] : [];
        if (toolCalls.length > 0) {
          children.push({ kind: 'ai_decision', span: ai, toolCallsRequested: toolCalls });
        } else {
          const text = responseEvent ? String(responseEvent.attributes.text ?? '') : '';
          children.push({ kind: 'ai_response', span: ai, text });
        }
      }
    } else if (phaseName === 'execution_loop') {
      // Interleave AI (param extraction) and tool spans
      const interleaved = [
        ...childAi.map((s) => ({ type: 'ai' as const, span: s })),
        ...childTools.map((s) => ({ type: 'tool' as const, span: s })),
      ].sort((a, b) => new Date(a.span.startTime).getTime() - new Date(b.span.startTime).getTime());

      // Build search sub-step map for tools in this phase
      const toolSearchMap = new Map<string, SpanDetail[]>();
      for (const search of childSearches) {
        const sStart = new Date(search.startTime).getTime();
        for (const tool of childTools) {
          const tStart = new Date(tool.startTime).getTime();
          const tEnd = new Date(tool.endTime).getTime();
          if (withinWindow(sStart, tStart, tEnd)) {
            const arr = toolSearchMap.get(tool.id) ?? [];
            arr.push(search);
            toolSearchMap.set(tool.id, arr);
            break;
          }
        }
      }

      // Build search embedding map
      const searchEmbeddingMap = new Map<string, SpanDetail>();
      for (const emb of childEmbeddings) {
        const feature = emb.attributes?.['alpha.ai.embedding_feature'];
        if (feature === 'embedding_service' || feature === 'session_message') continue;
        const embStart = new Date(emb.startTime).getTime();
        for (const search of childSearches) {
          const sStart = new Date(search.startTime).getTime();
          const sEnd = new Date(search.endTime).getTime();
          if (withinWindow(embStart, sStart, sEnd) && !searchEmbeddingMap.has(search.id)) {
            searchEmbeddingMap.set(search.id, emb);
            break;
          }
        }
      }

      // Track tool inputs from AI param extraction responses
      const toolInputByOrder = new Map<number, unknown>();
      const aiList = interleaved.filter((x) => x.type === 'ai');
      for (let idx = 0; idx < aiList.length; idx++) {
        const responseEvent = getEvent(aiList[idx].span, 'ai.response');
        const text = responseEvent ? String(responseEvent.attributes.text ?? '') : '';
        const parsed = tryParseJSON<Record<string, unknown>>(text);
        if (parsed) toolInputByOrder.set(idx, parsed);
      }

      let toolIdx = 0;
      for (const item of interleaved) {
        if (item.type === 'ai') {
          // Param extraction AI call — show as a compact step
          const responseEvent = getEvent(item.span, 'ai.response');
          const text = responseEvent ? String(responseEvent.attributes.text ?? '') : '';
          children.push({ kind: 'ai_response', span: item.span, text });
        } else {
          // Tool execution
          const rawSearches = toolSearchMap.get(item.span.id) ?? [];
          const searches: SearchSubStep[] = rawSearches.map((s) => ({
            span: s,
            queryEmbedding: searchEmbeddingMap.get(s.id) ?? null,
          }));
          // Prefer input_params span attribute (reliable), fall back to AI response parsing
          const inputParamsAttr = item.span.attributes?.['alpha.tool.input_params'];
          const toolInput = (inputParamsAttr ? tryParseJSON(String(inputParamsAttr)) : null)
            ?? toolInputByOrder.get(toolIdx)
            ?? null;
          children.push({ kind: 'tool_call', span: item.span, searches, toolInput });
          toolIdx++;
        }
      }
    } else if (phaseName === 'response_synthesis') {
      // Show the AI call that generated the response
      for (const ai of childAi) {
        const responseEvent = getEvent(ai, 'ai.response');
        const text = responseEvent ? String(responseEvent.attributes.text ?? '') : '';
        children.push({ kind: 'ai_response', span: ai, text });
      }
    }
    // context_assembly and persistence don't need child steps

    // Attach action step spans to execution_loop phase for per-step rendering
    const phaseActionSteps = phaseName === 'execution_loop'
      ? actionStepSpans.filter((s) => withinWindow(new Date(s.startTime).getTime(), pStart, pEnd))
      : undefined;

    steps.push({ kind: 'v2_phase', span: phase, phase: phaseName, label, children, actionStepSpans: phaseActionSteps });
  }

  return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step renderers
// ─────────────────────────────────────────────────────────────────────────────

function StepRow({
  icon,
  iconClass,
  label,
  badge,
  duration,
  children,
  defaultOpen = false,
  accent,
  forceOpen,
}: {
  icon: React.ElementType;
  iconClass: string;
  label: string;
  badge?: React.ReactNode;
  duration?: number;
  children?: React.ReactNode;
  defaultOpen?: boolean;
  accent?: string;
  /** When true, the row stays expanded and cannot be collapsed */
  forceOpen?: boolean;
}) {
  const [open, setOpen] = useState(forceOpen || defaultOpen);
  const Icon = icon;
  const hasChildren = !!children;
  const canToggle = hasChildren && !forceOpen;

  return (
    <div className={cn('border-b last:border-b-0', accent && open ? `border-l-2 ${accent} ml-0` : '')}>
      {/* Use div instead of button to allow CopyButton (also a button) inside the badge area */}
      <div
        role={canToggle ? 'button' : undefined}
        tabIndex={canToggle ? 0 : undefined}
        className={cn(
          'flex w-full items-center gap-3 px-5 py-3 text-left transition-colors',
          canToggle ? 'hover:bg-muted/40 cursor-pointer' : 'cursor-default',
        )}
        onClick={() => canToggle && setOpen(!open)}
        onKeyDown={(e) => { if (canToggle && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(!open); } }}
      >
        <div className={cn('shrink-0 rounded-full p-1.5', iconClass.replace('text-', 'bg-').replace('-500', '-100').replace('-600', '-100').replace('dark:text-', 'dark:bg-').replace('-400', '-900/30'))}>
          <Icon className={cn('size-3.5', iconClass)} />
        </div>
        <span className="flex-1 text-sm font-medium">{label}</span>
        <div className="flex shrink-0 items-center gap-2">
          {badge}
          {duration !== undefined && (
            <span className="text-xs font-mono text-muted-foreground tabular-nums">{fmt(duration)}</span>
          )}
          {canToggle && (
            open
              ? <ChevronDown className="size-3.5 text-muted-foreground" />
              : <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
        </div>
      </div>
      {open && children && (
        <div className="px-5 pb-4">{children}</div>
      )}
    </div>
  );
}

function SystemPromptStep({ spans }: { spans: SpanDetail[] }) {
  // Find the agentic.system_prompt event on any pipeline span
  let systemPrompt: string | null = null;
  let toolDefinitions: Array<{ name: string; description: string }> | null = null;
  let toolNames: string | null = null;

  for (const span of spans) {
    const event = span.events?.find((e) => e.name === 'agentic.system_prompt');
    if (event) {
      systemPrompt = String(event.attributes?.system_prompt ?? '');
      toolNames = String(event.attributes?.tool_names ?? '');
      const rawDefs = event.attributes?.tool_definitions;
      if (rawDefs) {
        toolDefinitions = tryParseJSON<Array<{ name: string; description: string }>>(rawDefs);
      }
      break;
    }
  }

  if (!systemPrompt) return null;

  return (
    <StepRow
      icon={FileText}
      iconClass="text-slate-500"
      label="System prompt sent to AI"
      badge={
        <>
          <CopyButton text={systemPrompt} title="Copy system prompt" />
          <Badge variant="secondary" className="text-[10px]">
            {toolDefinitions ? `${toolDefinitions.length} tools` : toolNames ? `tools: ${toolNames}` : 'system'}
          </Badge>
        </>
      }
      defaultOpen={false}
      accent="border-slate-300"
    >
      {toolDefinitions && toolDefinitions.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Tools available to AI</p>
          <div className="space-y-1.5">
            {toolDefinitions.map((t) => (
              <div key={t.name} className="rounded-lg border bg-muted/30 px-3 py-2">
                <p className="text-xs font-bold font-mono text-orange-600 dark:text-orange-400">{t.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">{t.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="mb-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">System prompt</p>
        <pre className="max-h-64 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] font-mono leading-relaxed whitespace-pre-wrap wrap-break-word">
          {systemPrompt}
        </pre>
      </div>
    </StepRow>
  );
}

function AiDecisionStep({ step, forceOpen }: { step: Extract<TimelineStep, { kind: 'ai_decision' }>; forceOpen?: boolean }) {
  const model = getAttr(step.span, 'alpha.ai.model_key');
  const inputTokens = step.span.attributes?.['alpha.ai.input_tokens'];
  const toolNames = step.toolCallsRequested.map((t) => t.name).join(', ');
  const copyText = JSON.stringify({ model, inputTokens, toolCalls: step.toolCallsRequested }, null, 2);

  return (
    <StepRow
      icon={Bot}
      iconClass="text-violet-600 dark:text-violet-400"
      label={`AI decided to use: ${toolNames}`}
      duration={step.span.durationMs}
      badge={
        <>
          <CopyButton text={copyText} title="Copy step" />
          <Badge variant="secondary" className="text-[10px]">tool call</Badge>
        </>
      }
      defaultOpen={false}
      forceOpen={forceOpen}
      accent="border-violet-400"
    >
      {model && (
        <p className="mb-3 text-xs text-muted-foreground font-mono">{model} · {inputTokens != null ? `${inputTokens} input tokens` : ''}</p>
      )}
      <div className="space-y-2">
        {step.toolCallsRequested.map((tc, i) => (
          <div key={i} className="rounded-lg border bg-muted/30 p-3">
            <p className="mb-1.5 text-xs font-bold text-orange-600 dark:text-orange-400">{tc.name}</p>
            {tc.input != null ? (
              <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all overflow-auto max-h-40">
                {JSON.stringify(tc.input, null, 2)}
              </pre>
            ) : (
              <p className="text-[11px] text-muted-foreground italic">
                Enable &quot;Full&quot; telemetry detail level to see tool inputs
              </p>
            )}
          </div>
        ))}
      </div>
    </StepRow>
  );
}

function AiResponseStep({ step, forceOpen }: { step: Extract<TimelineStep, { kind: 'ai_response' }>; forceOpen?: boolean }) {
  const model = getAttr(step.span, 'alpha.ai.model_key');
  const outputTokens = step.span.attributes?.['alpha.ai.output_tokens'];
  const ttft = step.span.attributes?.['alpha.ai.time_to_first_token_ms'];
  const preview = step.text ? (step.text.length > 200 ? step.text.slice(0, 200) + '…' : step.text) : '';
  const copyText = step.text || JSON.stringify({ model, outputTokens, durationMs: step.span.durationMs }, null, 2);

  return (
    <StepRow
      icon={Bot}
      iconClass="text-violet-600 dark:text-violet-400"
      label="AI responded"
      duration={step.span.durationMs}
      badge={
        <>
          <CopyButton text={copyText} title="Copy response" />
          <Badge variant="outline" className="text-[10px] text-violet-600 border-violet-300">response</Badge>
        </>
      }
      defaultOpen={!!preview}
      forceOpen={forceOpen}
      accent="border-violet-400"
    >
      {preview && (
        <div className="rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 px-4 py-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{preview}</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {model && <span className="font-mono">{model}</span>}
        {outputTokens != null && <span>{String(outputTokens)} output tokens</span>}
        {ttft != null && <span>first token in {fmt(Number(ttft))}</span>}
      </div>
    </StepRow>
  );
}

function EmbeddingChip({ span, index }: { span: SpanDetail; index?: number }) {
  const model = getAttr(span, 'alpha.ai.model_key');
  const feature = getAttr(span, 'alpha.ai.embedding_feature');

  const label = feature === 'search_query'
    ? 'Search query vectorized'
    : feature === 'session_message' || feature === 'embedding_service'
    ? 'Session message embedded'
    : 'Vector embedding';

  const detail = feature === 'search_query'
    ? 'Query converted to vector for hybrid search'
    : feature === 'session_message' || feature === 'embedding_service'
    ? 'Message stored for semantic memory retrieval'
    : 'Embedding generated';

  return (
    <div className="flex items-start gap-2 px-3 py-2 text-xs text-muted-foreground">
      <Search className="mt-0.5 size-3 shrink-0 text-blue-500" />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-blue-600 dark:text-blue-400">
          {label}{index != null ? ` #${index}` : ''}
        </span>
        <span className="mx-1.5 text-muted-foreground/50">—</span>
        <span>{detail}</span>
        {model && <span className="ml-1.5 font-mono opacity-60">{model}</span>}
      </div>
      <span className="shrink-0 font-mono tabular-nums">{fmt(span.durationMs)}</span>
    </div>
  );
}

/** Renders a single search.execute sub-step inside a tool call */
function SearchSubStepRow({ sub, index, total }: { sub: SearchSubStep; index: number; total: number }) {
  const query = getAttr(sub.span, 'alpha.search.query');
  const searchType = getAttr(sub.span, 'alpha.search.type');
  const returned = sub.span.attributes?.['alpha.search.results_returned'];
  const totalResults = sub.span.attributes?.['alpha.search.total_results'];
  const provider = getAttr(sub.span, 'alpha.search.provider');
  const esTook = sub.span.attributes?.['alpha.search.es_took_ms'];
  const indexName = getAttr(sub.span, 'alpha.search.index_name');
  const hasFilters = sub.span.attributes?.['alpha.search.has_filters'];

  const label = index > 1 ? `Search #${index}` : 'Search executed';
  const noResults = returned != null && Number(returned) === 0;

  const copyData = JSON.stringify({
    query, searchType, indexName, provider,
    resultsReturned: returned, totalResults,
    durationMs: sub.span.durationMs,
    esTookMs: esTook,
    queryVectorized: !!sub.queryEmbedding,
    embeddingModel: sub.queryEmbedding ? getAttr(sub.queryEmbedding, 'alpha.ai.model_key') : null,
    embeddingDurationMs: sub.queryEmbedding?.durationMs ?? null,
  }, null, 2);

  return (
    <div className="rounded-lg border border-blue-200/70 dark:border-blue-800/40 bg-blue-50/40 dark:bg-blue-950/10 overflow-hidden mb-2 last:mb-0">
      {/* Search header row */}
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        <Search className="size-3 shrink-0 text-blue-500" />
        <span className="font-semibold text-blue-700 dark:text-blue-300">
          {total > 1 ? label : 'Search executed'}
        </span>
        {query && (
          <span className="font-mono text-muted-foreground truncate max-w-[200px]">&ldquo;{query}&rdquo;</span>
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {searchType && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400">
              {searchType}
            </Badge>
          )}
          <CopyButton text={copyData} title="Copy search details" />
          <span className="font-mono tabular-nums text-muted-foreground">{fmt(sub.span.durationMs)}</span>
        </div>
      </div>

      {/* Search details grid */}
      <div className="px-3 pb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground border-t border-blue-100/60 dark:border-blue-900/30 pt-1.5">
        {returned != null && (
          <span className={noResults ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-green-700 dark:text-green-400 font-semibold'}>
            {noResults ? '⚠ ' : '✓ '}{String(returned)} result{Number(returned) !== 1 ? 's' : ''} returned
            {totalResults != null && Number(totalResults) !== Number(returned)
              ? ` / ${String(totalResults)} total` : ''}
          </span>
        )}
        {esTook != null && <span>engine: {fmt(Number(esTook))}</span>}
        {provider && <span className="font-mono">{provider}</span>}
        {indexName && <span className="font-mono opacity-70">{indexName}</span>}
        {hasFilters === true || hasFilters === 'true' ? <span>with filters</span> : null}
      </div>

      {/* Query embedding row (if present) */}
      {sub.queryEmbedding && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-muted-foreground border-t border-blue-100/60 dark:border-blue-900/30 bg-blue-50/60 dark:bg-blue-950/20">
          <Search className="size-3 shrink-0 text-indigo-400" />
          <span className="text-indigo-600 dark:text-indigo-400 font-medium">Query vectorized</span>
          <span className="text-muted-foreground/50 mx-1">—</span>
          <span>Query converted to vector for {searchType ?? 'semantic'} search</span>
          {getAttr(sub.queryEmbedding, 'alpha.ai.model_key') && (
            <span className="ml-1 font-mono opacity-60">{getAttr(sub.queryEmbedding, 'alpha.ai.model_key')}</span>
          )}
          <span className="ml-auto font-mono tabular-nums">{fmt(sub.queryEmbedding.durationMs)}</span>
        </div>
      )}
    </div>
  );
}

function ToolCallStep({ step, forceOpen }: { step: Extract<TimelineStep, { kind: 'tool_call' }>; forceOpen?: boolean }) {
  const toolName = getAttr(step.span, 'alpha.tool.name') ?? step.span.operationName;
  const toolSuccess = step.span.attributes?.['alpha.tool.success'];
  const isSuccess = toolSuccess == null ? step.span.statusCode !== 'ERROR' : Boolean(toolSuccess);

  // Result counts come from span attributes recorded by tools.executor.ts
  const resultCount = step.span.attributes?.['alpha.tool.result_count'];
  const totalCount = step.span.attributes?.['alpha.tool.total_count'];
  const resultSizeChars = Number(step.span.attributes?.['alpha.tool.result_size_chars'] ?? 0);
  const resultEstTokens = Number(step.span.attributes?.['alpha.tool.result_est_tokens'] ?? 0);

  // Derive result count from search sub-steps if not on the tool span itself
  const searchResultCount = resultCount != null ? resultCount
    : step.searches.length > 0
    ? step.searches.reduce((acc, s) => acc + Number(s.span.attributes?.['alpha.search.results_returned'] ?? 0), 0)
    : null;
  const searchTotalCount = totalCount != null ? totalCount
    : step.searches.length === 1
    ? step.searches[0].span.attributes?.['alpha.search.total_results'] ?? null
    : null;

  const resultSummary = searchResultCount != null
    ? `${searchResultCount} result${Number(searchResultCount) !== 1 ? 's' : ''} returned${searchTotalCount != null && Number(searchTotalCount) !== Number(searchResultCount) ? ` (${searchTotalCount} total matches)` : ''}`
    : null;

  const toolCopyText = JSON.stringify({
    tool: toolName,
    success: isSuccess,
    durationMs: step.span.durationMs,
    input: step.toolInput ?? null,
    searches: step.searches.map(s => ({
      query: getAttr(s.span, 'alpha.search.query'),
      searchType: getAttr(s.span, 'alpha.search.type'),
      resultsReturned: s.span.attributes?.['alpha.search.results_returned'],
      totalResults: s.span.attributes?.['alpha.search.total_results'],
      durationMs: s.span.durationMs,
    })),
  }, null, 2);

  const hasContent = !!(step.toolInput || step.searches.length > 0);

  return (
    <StepRow
      icon={Wrench}
      iconClass="text-orange-600 dark:text-orange-400"
      label={toolName}
      duration={step.span.durationMs}
      badge={
        <>
          <CopyButton text={toolCopyText} title="Copy tool call" />
          {isSuccess
            ? <CheckCircle2 className="size-3.5 text-green-500" />
            : <XCircle className="size-3.5 text-destructive" />}
        </>
      }
      defaultOpen={hasContent}
      forceOpen={forceOpen}
      accent="border-orange-400"
    >
      {/* Search sub-steps (search.execute spans with query + embedding details) */}
      {step.searches.length > 0 && (
        <div className="mb-3">
          {step.searches.map((sub, i) => (
            <SearchSubStepRow key={sub.span.id} sub={sub} index={i + 1} total={step.searches.length} />
          ))}
        </div>
      )}

      {/* Tool input (sourced from AI decision step's tool_calls data) */}
      {step.toolInput != null ? (
        <div className="mb-3">
          <p className="mb-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Input</p>
          <pre className="max-h-40 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-all">
            {JSON.stringify(step.toolInput, null, 2)}
          </pre>
        </div>
      ) : null}

      {/* Result summary (from tool span attrs or aggregated from search sub-steps) */}
      {resultSummary != null && step.searches.length === 0 ? (
        <div className="flex items-center gap-2 text-xs">
          {Number(searchResultCount) === 0
            ? <XCircle className="size-3.5 text-amber-500" />
            : <CheckCircle2 className="size-3.5 text-green-500" />}
          <span className={Number(searchResultCount) === 0
            ? 'font-semibold text-amber-700 dark:text-amber-400'
            : 'font-semibold text-green-700 dark:text-green-400'
          }>
            {resultSummary}
          </span>
        </div>
      ) : null}

      {/* Context size — surfaces MCP/RAG payload bloat that feeds the next LLM call */}
      {resultSizeChars > 0 && (() => {
        const tone = resultEstTokens >= 25000
          ? { wrap: 'border-red-300 bg-red-500/10 text-red-700 dark:text-red-300', label: 'text-red-700 dark:text-red-300' }
          : resultEstTokens >= 5000
          ? { wrap: 'border-amber-300 bg-amber-500/10 text-amber-700 dark:text-amber-300', label: 'text-amber-700 dark:text-amber-400' }
          : { wrap: 'border-border/60 bg-muted/40 text-muted-foreground', label: 'text-foreground/80' };
        return (
          <div className={`mt-2 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${tone.wrap}`}>
            <span className={`font-semibold ${tone.label}`}>Context fed to LLM</span>
            <span className="font-mono tabular-nums">{resultSizeChars.toLocaleString()} chars</span>
            <span className="opacity-50">·</span>
            <span className="font-mono tabular-nums">~{resultEstTokens.toLocaleString()} tokens</span>
            {resultEstTokens >= 25000 && (
              <span className="ml-1 font-medium">(may exceed model TPM limit)</span>
            )}
          </div>
        );
      })()}

      {/* Error */}
      {!isSuccess && step.span.statusMessage && (
        <p className="text-xs text-destructive">{step.span.statusMessage}</p>
      )}
    </StepRow>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// V2 Phase renderer
// ─────────────────────────────────────────────────────────────────────────────

const V2_PHASE_ICONS: Record<string, { icon: React.ElementType; iconClass: string; accent: string }> = {
  input_guardrail: { icon: ShieldCheck, iconClass: 'text-red-500', accent: 'border-red-300' },
  context_assembly: { icon: FileText, iconClass: 'text-slate-500', accent: 'border-slate-300' },
  turn_planner: { icon: Bot, iconClass: 'text-violet-600 dark:text-violet-400', accent: 'border-violet-400' },
  execution_loop: { icon: Wrench, iconClass: 'text-orange-600 dark:text-orange-400', accent: 'border-orange-400' },
  response_synthesis: { icon: Bot, iconClass: 'text-violet-600 dark:text-violet-400', accent: 'border-violet-400' },
  persistence: { icon: CheckCircle2, iconClass: 'text-green-500', accent: 'border-green-300' },
  // Guardrail sub-stages
  blocklist_check: { icon: ShieldCheck, iconClass: 'text-red-500', accent: 'border-red-200' },
  greeting_detection: { icon: MessageSquare, iconClass: 'text-amber-500', accent: 'border-amber-200' },
  domain_filter: { icon: Search, iconClass: 'text-violet-500', accent: 'border-violet-200' },
  lightweight_synthesis: { icon: Bot, iconClass: 'text-sky-500', accent: 'border-sky-200' },
};

function GuardrailStep({ step, forceOpen }: { step: Extract<TimelineStep, { kind: 'guardrail' }>; forceOpen?: boolean }) {
  const colors = CLASSIFICATION_COLORS[step.classification] ?? CLASSIFICATION_COLORS.domain;
  const domainSim = step.debug['alpha.v2.guardrail.domain_similarity'] as number | undefined;
  const generalSim = step.debug['alpha.v2.guardrail.general_similarity'] as number | undefined;
  const closestDomain = step.debug['alpha.v2.guardrail.closest_domain_term'] as string | undefined;
  const closestGeneral = step.debug['alpha.v2.guardrail.closest_general_term'] as string | undefined;
  const domainFilterEnabled = step.debug['alpha.v2.guardrail.domain_filter_enabled'] === true;
  const greetingMatched = step.debug['alpha.v2.guardrail.greeting_regex_matched'] === true;

  // Route descriptions
  const ROUTE_INFO: Record<string, { label: string; description: string; icon: typeof ArrowRight; bannerClass: string }> = {
    blocked: { label: 'Blocked', description: 'Message matched a blocklist rule and was rejected', icon: X, bannerClass: 'bg-red-500/10 border-red-300 text-red-700 dark:text-red-300' },
    greeting: { label: 'Greeting → Lightweight AI', description: 'Detected as a greeting, responded with a lightweight AI call instead of full pipeline', icon: MessageSquare, bannerClass: 'bg-amber-500/10 border-amber-300 text-amber-700 dark:text-amber-300' },
    general: {
      label: step.shortCircuited ? 'General → Lightweight AI' : 'General → Full Pipeline (active session)',
      description: step.shortCircuited
        ? 'Classified as general/smalltalk, responded with lightweight AI instead of full pipeline'
        : 'Classified as general but user has an active session — treated as a follow-up and routed to full pipeline',
      icon: step.shortCircuited ? MessageSquare : ArrowRight,
      bannerClass: step.shortCircuited ? 'bg-sky-500/10 border-sky-300 text-sky-700 dark:text-sky-300' : 'bg-violet-500/10 border-violet-300 text-violet-700 dark:text-violet-300',
    },
    off_topic: { label: 'Off-topic → Lightweight AI', description: 'Message is outside the configured domain, responded with a polite redirect', icon: X, bannerClass: 'bg-slate-500/10 border-slate-300 text-slate-600 dark:text-slate-400' },
    domain: { label: 'Domain → Full Pipeline', description: 'Message is on-topic, proceeding through the full Plan → Execute → Synthesize pipeline', icon: ArrowRight, bannerClass: 'bg-violet-500/10 border-violet-300 text-violet-700 dark:text-violet-300' },
  };

  const route = ROUTE_INFO[step.classification] ?? ROUTE_INFO.domain;
  const RouteIcon = route.icon;

  return (
    <StepRow
      icon={ShieldCheck}
      iconClass="text-red-500"
      label="Input guardrail"
      duration={step.span.durationMs}
      badge={
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${colors.bg} ${colors.text}`}>
          <span className={`size-1.5 rounded-full ${colors.dot}`} />
          {step.classification}
        </span>
      }
      defaultOpen
      forceOpen={forceOpen}
      accent="border-red-300"
    >
      {/* Routing decision banner — the most important thing to see */}
      <div className={cn('flex items-start gap-3 rounded-lg border px-4 py-3 mb-3', route.bannerClass)}>
        <RouteIcon className="size-5 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold">{route.label}</p>
          <p className="text-xs mt-0.5 opacity-80">{route.description}</p>
        </div>
      </div>

      {/* Classification details */}
      <div className="space-y-2 mb-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-muted/50 px-3 py-1.5">
            <span className="text-muted-foreground">Greeting regex:</span>{' '}
            <span className="font-medium">{greetingMatched ? 'matched' : 'no match'}</span>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-1.5">
            <span className="text-muted-foreground">Domain filter:</span>{' '}
            <span className="font-medium">{domainFilterEnabled ? 'enabled' : 'disabled'}</span>
          </div>
        </div>

        {/* Similarity scores (when domain filter ran) */}
        {domainSim !== undefined && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-violet-500/5 border border-violet-500/10 px-3 py-1.5">
              <span className="text-muted-foreground">Domain similarity:</span>{' '}
              <span className="font-semibold text-violet-700 dark:text-violet-300">{domainSim}</span>
              {closestDomain && <span className="text-muted-foreground ml-1">({closestDomain})</span>}
            </div>
            <div className="rounded-md bg-sky-500/5 border border-sky-500/10 px-3 py-1.5">
              <span className="text-muted-foreground">General similarity:</span>{' '}
              <span className="font-semibold text-sky-700 dark:text-sky-300">{generalSim ?? '—'}</span>
              {closestGeneral && <span className="text-muted-foreground ml-1">({closestGeneral})</span>}
            </div>
          </div>
        )}
      </div>

      {/* Response text from lightweight synthesis (when short-circuited) */}
      {step.shortCircuited && (() => {
        const synthChild = step.children.find((c) => c.kind === 'v2_phase' && c.phase === 'lightweight_synthesis');
        const responseText = synthChild?.span?.attributes?.['alpha.v2.guardrail.response_text'] as string | undefined;
        if (!responseText) return null;
        return (
          <div className="rounded-md border bg-muted/30 px-3 py-2 mb-3">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">AI Response</p>
            <p className="text-sm leading-relaxed">{responseText}</p>
          </div>
        );
      })()}

      {/* Sub-stage spans */}
      {step.children.length > 0 && (
        <div className="divide-y rounded-lg border overflow-hidden">
          {step.children.map((child, i) => {
            if (child.kind === 'v2_phase') {
              const style = V2_PHASE_ICONS[child.phase] ?? { icon: Clock, iconClass: 'text-muted-foreground', accent: '' };
              return (
                <div key={i} className="flex items-center gap-2 px-4 py-2 text-xs">
                  <style.icon className={cn('size-3.5', style.iconClass)} />
                  <span className="font-medium">{child.label}</span>
                  <span className="text-muted-foreground ml-auto">{fmt(child.span.durationMs)}</span>
                </div>
              );
            }
            return null;
          })}
        </div>
      )}
    </StepRow>
  );
}

function V2PhaseStep({ step, forceOpen }: { step: Extract<TimelineStep, { kind: 'v2_phase' }>; forceOpen?: boolean }) {
  const style = V2_PHASE_ICONS[step.phase] ?? { icon: Clock, iconClass: 'text-muted-foreground', accent: '' };
  const isError = step.span.statusCode === 'ERROR';
  const hasChildren = step.children.length > 0;

  // Build summary attributes
  const actionCount = step.span.attributes?.['alpha.v2.plan.action_count'];
  const directResponse = step.span.attributes?.['alpha.v2.plan.direct_response'];
  const executedActions = step.span.attributes?.['alpha.v2.executed_actions'];
  const preset = step.span.attributes?.['alpha.v2.preset'];
  const responseLength = step.span.attributes?.['alpha.v2.response_length'];
  const responseText = step.span.attributes?.['alpha.v2.response_text'] as string | undefined;
  const summary = step.span.attributes?.['alpha.v2.context_assembly.summary'];
  const planActionsRaw = step.span.attributes?.['alpha.v2.plan.actions'] as string | undefined;
  const planActions = planActionsRaw ? tryParseJSON<Array<{ tool: string; intent: string; hints?: unknown }>>(planActionsRaw) : null;

  const badgeText = step.phase === 'turn_planner'
    ? (directResponse === true || directResponse === 'true')
      ? 'direct response'
      : actionCount != null ? `${actionCount} tool${Number(actionCount) !== 1 ? 's' : ''} planned` : 'plan'
    : step.phase === 'execution_loop'
    ? executedActions != null ? `${executedActions} tool${Number(executedActions) !== 1 ? 's' : ''} run` : 'execution'
    : step.phase === 'response_synthesis'
    ? preset ? String(preset) : 'synthesis'
    : step.phase === 'context_assembly'
    ? 'context'
    : step.phase === 'persistence'
    ? 'saved'
    : step.phase;

  return (
    <StepRow
      icon={style.icon}
      iconClass={style.iconClass}
      label={step.label}
      duration={step.span.durationMs}
      badge={
        <>
          <Badge variant="secondary" className="text-[10px]">{badgeText}</Badge>
          {isError && <XCircle className="size-3.5 text-destructive" />}
        </>
      }
      defaultOpen={hasChildren}
      forceOpen={forceOpen}
      accent={style.accent}
    >
      {/* Phase-specific summary */}
      {step.phase === 'context_assembly' && summary && (
        <p className="text-xs text-muted-foreground mb-3">{String(summary)}</p>
      )}
      {step.phase === 'turn_planner' && planActions && planActions.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            AI decided to use {planActions.length} tool{planActions.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-2">
            {planActions.map((a, idx) => (
              <div key={idx} className="rounded-lg border bg-muted/30 px-3 py-2.5">
                <div className="flex items-center gap-2 text-xs">
                  <Wrench className="size-3 text-orange-500 shrink-0" />
                  <span className="font-semibold font-mono text-orange-600 dark:text-orange-400">{a.tool}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground ml-5">{a.intent}</p>
                {a.hints && (
                  <pre className="mt-1.5 ml-5 text-[10px] text-muted-foreground/70 font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify(a.hints, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {step.phase === 'turn_planner' && (directResponse === true || directResponse === 'true') && (
        <div className="mb-3">
          <p className="text-xs text-muted-foreground">
            AI decided to respond directly without using any tools.
          </p>
        </div>
      )}
      {step.phase === 'response_synthesis' && (() => {
        const presetReason = step.span.attributes?.['alpha.v2.preset_reason'] as string | undefined;
        const presetItemCount = step.span.attributes?.['alpha.v2.preset_item_count'] as number | undefined;
        const presetEnabled = step.span.attributes?.['alpha.v2.preset_enabled'] as string | undefined;
        const presetTool = step.span.attributes?.['alpha.v2.preset_tool'] as string | undefined;
        const presetToolPreferred = step.span.attributes?.['alpha.v2.preset_tool_preferred'] as string | undefined;

        return (
          <div className="mb-3 space-y-3">
            {/* Preset selection summary */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Preset Selection</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-xs font-semibold">{preset ? String(preset) : 'rich_text'}</Badge>
                {presetReason && (
                  <span className="text-[10px] text-muted-foreground font-mono">{presetReason}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {presetItemCount != null && (
                  <div className="rounded-md bg-muted/50 px-2 py-1">
                    <span className="text-muted-foreground">Items:</span>{' '}
                    <span className="font-medium">{String(presetItemCount)}</span>
                  </div>
                )}
                {presetTool && (
                  <div className="rounded-md bg-muted/50 px-2 py-1">
                    <span className="text-muted-foreground">Tool:</span>{' '}
                    <span className="font-medium font-mono">{presetTool}</span>
                  </div>
                )}
                {presetToolPreferred && (
                  <div className="rounded-md bg-muted/50 px-2 py-1 col-span-2">
                    <span className="text-muted-foreground">Tool preferred:</span>{' '}
                    <span className="font-medium">{presetToolPreferred}</span>
                  </div>
                )}
                {presetEnabled && (
                  <div className="rounded-md bg-muted/50 px-2 py-1 col-span-2">
                    <span className="text-muted-foreground">Enabled presets:</span>{' '}
                    <span className="font-medium">{presetEnabled}</span>
                  </div>
                )}
              </div>
            </div>

            {responseLength != null && (
              <p className="text-xs text-muted-foreground">{String(responseLength)} chars generated</p>
            )}
            {responseText && (
              <>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">AI Response</p>
                <pre className="max-h-48 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-words">
                  {responseText}
                </pre>
              </>
            )}
          </div>
        );
      })()}

      {/* Child steps — phase-aware rendering */}
      {step.phase === 'turn_planner' && hasChildren && (() => {
        // For the planner, the AI call is what generated the plan.
        // Show metadata inline instead of a confusing "AI responded" step.
        const aiChild = step.children.find((c) => c.kind === 'ai_response' || c.kind === 'ai_decision');
        const aiSpan = aiChild && 'span' in aiChild ? aiChild.span : null;
        const model = aiSpan ? getAttr(aiSpan, 'alpha.ai.model_key') : null;
        const inputTokens = aiSpan?.attributes?.['alpha.ai.input_tokens'];
        const outputTokens = aiSpan?.attributes?.['alpha.ai.output_tokens'];
        return (
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground mt-2 pt-2 border-t">
            <span className="font-medium">Plan generated by AI</span>
            {model && <span className="font-mono">{model}</span>}
            {inputTokens != null && <span>{String(inputTokens)} in</span>}
            {outputTokens != null && <span>{String(outputTokens)} out</span>}
            {aiSpan && <span className="font-mono tabular-nums">{fmt(aiSpan.durationMs)}</span>}
          </div>
        );
      })()}
      {step.phase === 'execution_loop' && (() => {
        // Parse action steps & action summaries from the execution_loop span
        const rawActionSteps = step.span.attributes?.['alpha.v2.action_steps'] as string | undefined;
        const actionSteps = rawActionSteps
          ? tryParseJSON<Array<{ toolSlug: string; step: string; detail?: string; durationMs: number }>>(rawActionSteps)
          : null;
        const rawActionSummaries = step.span.attributes?.['alpha.v2.action_summaries'] as string | undefined;
        const actionSummaries = rawActionSummaries
          ? tryParseJSON<Array<{ tool: string; intent: string; success: boolean; resultCount?: number; durationMs: number; hadFilters: boolean; query?: string }>>(rawActionSummaries)
          : null;

        // Group action steps by tool
        const stepsByTool = new Map<string, Array<{ step: string; detail?: string; durationMs: number }>>();
        if (actionSteps) {
          for (const as of actionSteps) {
            const arr = stepsByTool.get(as.toolSlug) ?? [];
            arr.push({ step: as.step, detail: as.detail, durationMs: as.durationMs });
            stepsByTool.set(as.toolSlug, arr);
          }
        }

        // Group child spans by tool slug for matching to action summaries
        const childrenByToolSlug = new Map<string, { ai: TimelineStep[]; tool: TimelineStep[]; embedding: TimelineStep[] }>();
        for (const child of step.children) {
          let slug = '';
          if (child.kind === 'tool_call') {
            slug = getAttr(child.span, 'alpha.tool.slug') ?? getAttr(child.span, 'alpha.tool.name') ?? '';
          } else if (child.kind === 'ai_response' || child.kind === 'ai_decision') {
            // AI param extraction — match by feature attribute
            const feature = getAttr(child.span, 'alpha.ai.feature');
            if (feature === 'param-extraction') slug = '__param_extraction__';
          }
          if (!slug) continue;
          const group = childrenByToolSlug.get(slug) ?? { ai: [], tool: [], embedding: [] };
          if (child.kind === 'ai_response' || child.kind === 'ai_decision') group.ai.push(child);
          else if (child.kind === 'tool_call') group.tool.push(child);
          else if (child.kind === 'embedding') group.embedding.push(child);
          childrenByToolSlug.set(slug, group);
        }

        // Use module-level ACTION_STEP_META for labels

        // ── New: per-step spans from step chain runner (pipeline.v2.action.*) ──
        const perStepSpans = step.actionStepSpans;
        const hasPerStepSpans = perStepSpans && perStepSpans.length > 0;

        // Group per-step spans by tool slug, then show each action as a card
        // with its sub-step pipeline built from real spans
        if (hasPerStepSpans) {
          // Group spans by tool slug
          const spansByTool = new Map<string, SpanDetail[]>();
          for (const s of perStepSpans) {
            const tool = String(s.attributes?.['alpha.v2.action_step.tool'] ?? 'unknown');
            const arr = spansByTool.get(tool) ?? [];
            arr.push(s);
            spansByTool.set(tool, arr);
          }

          return (
            <div className="space-y-3">
              {[...spansByTool.entries()].map(([toolSlug, spans]) => {
                // Find action summary from span attributes (if available)
                const actionSummary = actionSummaries?.find((a) => a.tool === toolSlug);
                const intent = actionSummary?.intent ?? '';
                const resultCount = actionSummary?.resultCount;
                const success = actionSummary?.success ?? true;
                const totalDurationMs = actionSummary?.durationMs ?? spans.reduce((acc, s) => acc + s.durationMs, 0);
                const hasRetry = spans.some((s) =>
                  String(s.attributes?.['alpha.v2.action_step.id'] ?? '').includes('retry') ||
                  String(s.attributes?.['alpha.v2.action_step.id'] ?? '').includes('relaxation'),
                );
                const noRetryButZero = resultCount === 0 && !hasRetry && !actionSummary?.hadFilters;

                return (
                  <div key={toolSlug} className="rounded-lg border overflow-hidden">
                    {/* Action header */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-muted/20">
                      <div className="rounded-full bg-orange-100 dark:bg-orange-900/30 p-1.5">
                        <Wrench className="size-3.5 text-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold font-mono text-orange-600 dark:text-orange-400">{toolSlug}</p>
                        {intent && <p className="text-[11px] text-muted-foreground mt-0.5">{intent}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {hasRetry && (
                          <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                            retried
                          </Badge>
                        )}
                        {resultCount != null && (
                          <span className={cn(
                            'text-[11px] font-semibold',
                            resultCount === 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400',
                          )}>
                            {resultCount} result{resultCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {success
                          ? <CheckCircle2 className="size-3.5 text-green-500" />
                          : <XCircle className="size-3.5 text-red-500" />}
                        <span className="font-mono tabular-nums text-[11px] text-muted-foreground">{fmt(totalDurationMs)}</span>
                      </div>
                    </div>

                    {/* Per-step pipeline from real spans */}
                    <div className="border-t divide-y">
                      {spans.map((s, j) => (
                        <ActionStepSpanRow key={j} span={s} />
                      ))}

                      {/* Zero results + no retry explanation */}
                      {noRetryButZero && (
                        <div className="flex items-start gap-2.5 px-4 py-2 text-[11px] bg-amber-50/30 dark:bg-amber-950/5">
                          <XCircle className="size-3 mt-0.5 shrink-0 text-amber-400" />
                          <span className="text-amber-700 dark:text-amber-300">
                            0 results — no filters to relax, so retry was skipped.
                            {actionSummary?.query && <span className="font-mono ml-1">Query: &ldquo;{actionSummary.query}&rdquo;</span>}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }

        return (
          <div className="space-y-3">
            {actionSummaries && actionSummaries.length > 0 ? (
              actionSummaries.map((action, idx) => {
                const toolSteps = stepsByTool.get(action.tool);
                const hasRetry = toolSteps?.some((s) => s.step === 'query_relaxation' || s.step === 'filter_relaxation');
                const noRetryButZero = action.resultCount === 0 && !hasRetry && !action.hadFilters;

                // Find matching child spans for this action
                const toolChildren = childrenByToolSlug.get(action.tool);
                const paramExtractionChildren = childrenByToolSlug.get('__param_extraction__');

                // Get the tool.execute child span to show search details, input params
                const toolChild = toolChildren?.tool[idx] ?? toolChildren?.tool[0];
                const toolCallStep = toolChild?.kind === 'tool_call' ? toolChild : null;

                // Get param extraction AI call
                const paramAi = paramExtractionChildren?.ai[idx] ?? paramExtractionChildren?.ai[0];
                const paramAiSpan = paramAi && 'span' in paramAi ? paramAi.span : null;

                // Get tool input params from tool.execute span
                const toolInputRaw = toolCallStep?.span.attributes?.['alpha.tool.input_params'];
                const toolInput = toolInputRaw ? tryParseJSON<Record<string, unknown>>(String(toolInputRaw)) : null;

                return (
                  <div key={idx} className="rounded-lg border overflow-hidden">
                    {/* Action header */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-muted/20">
                      <div className="rounded-full bg-orange-100 dark:bg-orange-900/30 p-1.5">
                        <Wrench className="size-3.5 text-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold font-mono text-orange-600 dark:text-orange-400">{action.tool}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{action.intent}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {hasRetry && (
                          <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                            retried
                          </Badge>
                        )}
                        {action.resultCount != null && (
                          <span className={cn(
                            'text-[11px] font-semibold',
                            action.resultCount === 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400',
                          )}>
                            {action.resultCount} result{action.resultCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {action.success
                          ? <CheckCircle2 className="size-3.5 text-green-500" />
                          : <XCircle className="size-3.5 text-red-500" />}
                        <span className="font-mono tabular-nums text-[11px] text-muted-foreground">{fmt(action.durationMs)}</span>
                      </div>
                    </div>

                    {/* Sub-step pipeline — combines action_step events with child span data */}
                    <div className="border-t divide-y">
                      {/* 1. Context enrichment (from action_steps) */}
                      {toolSteps?.filter((s) => s.step === 'context_enrichment').map((ts, j) => (
                        <div key={`enrich-${j}`} className="flex items-start gap-2.5 px-4 py-2 text-[11px]">
                          <FileText className="size-3 mt-0.5 shrink-0 text-slate-400" />
                          <span className="font-medium text-muted-foreground">Context enriched</span>
                          {ts.detail && <span className="text-muted-foreground/70 flex-1 min-w-0">{ts.detail}</span>}
                          {ts.durationMs > 0 && <span className="ml-auto shrink-0 font-mono tabular-nums text-muted-foreground/50">{fmt(ts.durationMs)}</span>}
                        </div>
                      ))}

                      {/* 2. Param extraction (from child AI span) */}
                      {paramAiSpan && (
                        <div className="px-4 py-2">
                          <div className="flex items-center gap-2.5 text-[11px]">
                            <Bot className="size-3 shrink-0 text-violet-400" />
                            <span className="font-medium text-muted-foreground">Params extracted by AI</span>
                            <span className="font-mono text-muted-foreground/60">{getAttr(paramAiSpan, 'alpha.ai.model_key')}</span>
                            <span className="text-muted-foreground/60">{String(paramAiSpan.attributes?.['alpha.ai.output_tokens'] ?? '')} tokens</span>
                            <span className="ml-auto shrink-0 font-mono tabular-nums text-muted-foreground/50">{fmt(paramAiSpan.durationMs)}</span>
                          </div>
                          {toolInput && (
                            <div className="mt-1.5 ml-5 rounded-md bg-muted/40 px-3 py-2">
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                                {Object.entries(toolInput).map(([k, v]) => (
                                  <div key={k}>
                                    <span className="text-muted-foreground">{k}: </span>
                                    <span className="font-mono font-medium">
                                      {v === null ? <span className="italic text-muted-foreground/50">none</span> : JSON.stringify(v)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 3. Filter validation (from action_steps) */}
                      {toolSteps?.filter((s) => s.step === 'filter_validation').map((ts, j) => (
                        <div key={`fv-${j}`} className="flex items-start gap-2.5 px-4 py-2 text-[11px]">
                          <Filter className="size-3 mt-0.5 shrink-0 text-blue-400" />
                          <span className="font-medium text-muted-foreground">Filters validated</span>
                          {ts.detail && <span className="text-muted-foreground/70 flex-1 min-w-0">{ts.detail}</span>}
                        </div>
                      ))}

                      {/* 4. Tool execution + search details (from child tool span) */}
                      {toolCallStep && (
                        <div className="px-4 py-2">
                          <div className="flex items-center gap-2.5 text-[11px]">
                            <Wrench className="size-3 shrink-0 text-orange-400" />
                            <span className="font-medium text-muted-foreground">Tool executed</span>
                            <span className="ml-auto shrink-0 font-mono tabular-nums text-muted-foreground/50">{fmt(toolCallStep.span.durationMs)}</span>
                          </div>
                          {/* Search sub-steps from the tool child */}
                          {toolCallStep.kind === 'tool_call' && toolCallStep.searches.length > 0 && (
                            <div className="mt-2 ml-5">
                              {toolCallStep.searches.map((sub, si) => (
                                <SearchSubStepRow key={si} sub={sub} index={si + 1} total={toolCallStep.searches.length} />
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 5. Retry steps — query relaxation, filter relaxation (from action_steps) */}
                      {toolSteps?.filter((s) => s.step === 'query_relaxation' || s.step === 'filter_relaxation').map((ts, j) => {
                        const meta = ACTION_STEP_META[ts.step]!;
                        const StepIcon = meta.icon;
                        return (
                          <div key={`retry-${j}`} className="flex items-start gap-2.5 px-4 py-2 text-[11px] bg-amber-50/50 dark:bg-amber-950/10">
                            <StepIcon className="size-3 mt-0.5 shrink-0 text-amber-500" />
                            <span className="font-medium text-amber-700 dark:text-amber-300">{meta.label}</span>
                            {ts.detail && <span className="text-amber-600/70 dark:text-amber-400/70 flex-1 min-w-0">{ts.detail}</span>}
                          </div>
                        );
                      })}

                      {/* 6. Zero results + no retry explanation */}
                      {noRetryButZero && (
                        <div className="flex items-start gap-2.5 px-4 py-2 text-[11px] bg-amber-50/30 dark:bg-amber-950/5">
                          <XCircle className="size-3 mt-0.5 shrink-0 text-amber-400" />
                          <span className="text-amber-700 dark:text-amber-300">
                            0 results — no filters to relax, so retry was skipped.
                            {action.query && <span className="font-mono ml-1">Query: &ldquo;{action.query}&rdquo;</span>}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : hasChildren ? (
              /* Fallback: render child spans when action_summaries not available (older traces) */
              <div className="divide-y rounded-lg border overflow-hidden">
                {step.children.map((child, i) => {
                  switch (child.kind) {
                    case 'ai_decision':
                      return <AiDecisionStep key={i} step={child} />;
                    case 'ai_response': {
                      const model = getAttr(child.span, 'alpha.ai.model_key');
                      const outputTokens = child.span.attributes?.['alpha.ai.output_tokens'];
                      return (
                        <div key={i} className="flex items-center gap-3 px-5 py-2.5 text-xs text-muted-foreground">
                          <Bot className="size-3.5 text-violet-400 shrink-0" />
                          <span className="font-medium">Extracted tool parameters</span>
                          {model && <span className="font-mono text-[11px]">{model}</span>}
                          {outputTokens != null && <span className="text-[11px]">{String(outputTokens)} tokens</span>}
                          <span className="ml-auto font-mono tabular-nums text-[11px]">{fmt(child.span.durationMs)}</span>
                        </div>
                      );
                    }
                    case 'tool_call':
                      return <ToolCallStep key={i} step={child} />;
                    case 'embedding':
                      return (
                        <div key={i} className="px-5 py-2">
                          <EmbeddingChip span={child.span} />
                        </div>
                      );
                    default:
                      return null;
                  }
                })}
              </div>
            ) : null}
          </div>
        );
      })()}
      {step.phase === 'response_synthesis' && hasChildren && (
        <div className="divide-y rounded-lg border overflow-hidden">
          {step.children.map((child, i) => {
            if (child.kind === 'ai_response') {
              // In synthesis, this is the final response generation — show clearly
              const model = getAttr(child.span, 'alpha.ai.model_key');
              const outputTokens = child.span.attributes?.['alpha.ai.output_tokens'];
              const ttft = child.span.attributes?.['alpha.ai.time_to_first_token_ms'];
              return (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Bot className="size-3.5 text-violet-400 shrink-0" />
                    <span className="font-medium">Generated final response</span>
                    {model && <span className="font-mono text-[11px]">{model}</span>}
                    {outputTokens != null && <span className="text-[11px]">{String(outputTokens)} tokens</span>}
                    {ttft != null && <span className="text-[11px]">first token {fmt(Number(ttft))}</span>}
                    <span className="ml-auto font-mono tabular-nums text-[11px]">{fmt(child.span.durationMs)}</span>
                  </div>
                </div>
              );
            }
            return null;
          })}
        </div>
      )}
      {/* Generic child rendering for other phases */}
      {step.phase !== 'turn_planner' && step.phase !== 'execution_loop' && step.phase !== 'response_synthesis' && hasChildren && (
        <div className="divide-y rounded-lg border overflow-hidden">
          {step.children.map((child, i) => {
            switch (child.kind) {
              case 'ai_decision':
                return <AiDecisionStep key={i} step={child} />;
              case 'ai_response':
                return <AiResponseStep key={i} step={child} />;
              case 'tool_call':
                return <ToolCallStep key={i} step={child} />;
              case 'embedding':
                return (
                  <div key={i} className="px-5 py-2">
                    <EmbeddingChip span={child.span} />
                  </div>
                );
              default:
                return null;
            }
          })}
        </div>
      )}

      {/* Error */}
      {isError && step.span.statusMessage && (
        <p className="mt-2 text-xs text-destructive">{step.span.statusMessage}</p>
      )}
    </StepRow>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────

function buildTraceCopy(rootSpan: SpanListItem, allSpans: SpanDetail[]): string {
  return JSON.stringify({
    userMessage: rootSpan.userMessage,
    experience: rootSpan.experienceSlug ?? rootSpan.experienceType,
    startTime: rootSpan.startTime,
    durationMs: rootSpan.durationMs,
    status: rootSpan.statusCode,
    spans: allSpans.map((s) => ({
      operation: s.operationName,
      durationMs: s.durationMs,
      status: s.statusCode,
      attributes: s.attributes,
      events: s.events,
    })),
  }, null, 2);
}

function TurnHeader({
  rootSpan,
  allSpans,
  onClose,
  onMaximize,
}: {
  rootSpan: SpanListItem;
  allSpans: SpanDetail[];
  onClose: () => void;
  onMaximize: () => void;
}) {
  const isError = rootSpan.statusCode === 'ERROR';
  const experience = rootSpan.experienceSlug ?? rootSpan.experienceType ?? null;

  // Aggregate totals from child spans
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let toolCallCount = 0;

  for (const span of allSpans) {
    const op = span.operationName;
    if (op === 'ai.stream_chat' || op === 'ai.chat') {
      totalInputTokens += Number(span.attributes?.['alpha.ai.input_tokens'] ?? 0);
      totalOutputTokens += Number(span.attributes?.['alpha.ai.output_tokens'] ?? 0);
    }
    if (op === 'tool.execute') toolCallCount++;
  }

  const totalTokens = totalInputTokens + totalOutputTokens;

  return (
    <div className="shrink-0 border-b bg-muted/20 px-5 py-4">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {/* User message */}
          <div className="flex items-start gap-2">
            <MessageSquare className="mt-0.5 size-4 shrink-0 text-blue-500" />
            <p className="text-sm font-semibold leading-snug">
              {rootSpan.userMessage?.trim() || <span className="italic text-muted-foreground">No message recorded</span>}
            </p>
          </div>

          {/* Metadata row */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {experience && (
              <span className="font-mono">{experience}</span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {fmt(rootSpan.durationMs)} total
            </span>
            {toolCallCount > 0 && (
              <span className="flex items-center gap-1">
                <Wrench className="size-3" />
                {toolCallCount} tool call{toolCallCount !== 1 ? 's' : ''}
              </span>
            )}
            {totalTokens > 0 && (
              <span className="flex items-center gap-1">
                <Zap className="size-3" />
                {totalTokens} tokens
              </span>
            )}
            <Badge
              variant={isError ? 'destructive' : 'success'}
              className="text-[10px] uppercase"
            >
              {isError ? 'Failed' : 'Success'}
            </Badge>
          </div>
        </div>

        <div className="flex shrink-0 gap-1">
          <CopyButton
            text={buildTraceCopy(rootSpan, allSpans)}
            title="Copy full trace as JSON"
            className="size-7"
          />
          <Button variant="ghost" size="icon" className="size-7" onClick={onMaximize} title="Full screen">
            <Maximize2 className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Overview — compact stepper showing all phases at a glance
// ─────────────────────────────────────────────────────────────────────────────

function getPhaseStatus(step: TimelineStep): 'success' | 'error' | 'skipped' | 'short_circuit' {
  if (step.kind === 'guardrail') {
    return step.shortCircuited ? 'short_circuit' : 'success';
  }
  const span = 'span' in step ? step.span : null;
  if (span?.statusCode === 'ERROR') return 'error';
  return 'success';
}

function getPhaseSummary(step: TimelineStep): string {
  if (step.kind === 'guardrail') {
    const routing = step.shortCircuited ? 'short-circuited' : 'passed';
    return `${step.classification} → ${routing}`;
  }
  if (step.kind === 'v2_phase') {
    const actionCount = step.span.attributes?.['alpha.v2.plan.action_count'];
    const directResponse = step.span.attributes?.['alpha.v2.plan.direct_response'];
    const executedActions = step.span.attributes?.['alpha.v2.executed_actions'];
    const preset = step.span.attributes?.['alpha.v2.preset'];
    const planActionsRaw = step.span.attributes?.['alpha.v2.plan.actions'] as string | undefined;

    if (step.phase === 'turn_planner') {
      if (directResponse === true || directResponse === 'true') return 'direct response';
      // Try to show tool names for clarity
      if (planActionsRaw) {
        const actions = tryParseJSON<Array<{ tool: string; intent: string }>>(planActionsRaw);
        if (actions && actions.length > 0) {
          return actions.map((a) => a.tool).join(', ');
        }
      }
      return actionCount != null ? `${actionCount} tool${Number(actionCount) !== 1 ? 's' : ''}` : '';
    }
    if (step.phase === 'execution_loop') {
      return executedActions != null ? `${executedActions} tool${Number(executedActions) !== 1 ? 's' : ''} run` : '';
    }
    if (step.phase === 'response_synthesis') {
      return preset ? String(preset) : '';
    }
    if (step.phase === 'context_assembly') return 'loaded';
    if (step.phase === 'persistence') return 'saved';
    return '';
  }
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Step Span Row — rich detail rendering for each execution sub-step
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_STEP_META: Record<string, { label: string; icon: React.ElementType; iconClass: string }> = {
  context_enrichment: { label: 'Context enriched', icon: FileText, iconClass: 'text-slate-400' },
  param_extraction: { label: 'Params extracted (AI)', icon: Bot, iconClass: 'text-violet-400' },
  param_validation: { label: 'Params validated', icon: CheckCircle2, iconClass: 'text-green-400' },
  filter_validation: { label: 'Filters validated', icon: Filter, iconClass: 'text-blue-400' },
  query_relaxation: { label: 'Query relaxed (0 results retry)', icon: RefreshCw, iconClass: 'text-amber-500' },
  filter_relaxation: { label: 'Filters relaxed (0 results retry)', icon: RefreshCw, iconClass: 'text-amber-500' },
  zero_result_retry: { label: 'Zero-result retry', icon: RefreshCw, iconClass: 'text-amber-500' },
  tool_execution: { label: 'Tool executed', icon: Wrench, iconClass: 'text-orange-400' },
  result_capture: { label: 'Results captured', icon: CheckCircle2, iconClass: 'text-green-400' },
};

function ActionStepSpanRow({ span }: { span: SpanDetail }) {
  const stepId = String(span.attributes?.['alpha.v2.action_step.id'] ?? '');
  const stepSummary = String(span.attributes?.['alpha.v2.action_step.summary'] ?? '');
  const stepSuccess = span.attributes?.['alpha.v2.action_step.success'] !== false;
  const meta = ACTION_STEP_META[stepId] ?? { label: stepId || span.operationName, icon: ArrowRight, iconClass: 'text-muted-foreground' };
  const StepIcon = meta.icon;
  const isRetry = stepId === 'zero_result_retry' || stepId === 'query_relaxation' || stepId === 'filter_relaxation';

  // Extract step-specific detail attributes
  const removedHints = span.attributes?.['alpha.v2.step.removed_hints'] as string | undefined;
  const sanitizedHints = span.attributes?.['alpha.v2.step.sanitized_hints'] as string | undefined;
  const enrichedFields = span.attributes?.['alpha.v2.step.enriched_fields'] as string | undefined;
  const extractedParams = span.attributes?.['alpha.v2.step.extracted_params'] as string | undefined;
  const query = span.attributes?.['alpha.v2.step.query'] as string | undefined;
  const filters = span.attributes?.['alpha.v2.step.filters'] as string | undefined;
  const sort = span.attributes?.['alpha.v2.step.sort'] as string | undefined;
  const hintAnnotations = span.attributes?.['alpha.v2.step.hint_annotations'] as string | undefined;
  const inputParams = span.attributes?.['alpha.v2.step.input_params'] as string | undefined;
  const resultCount = span.attributes?.['alpha.v2.step.result_count'] as number | undefined;
  const toolError = span.attributes?.['alpha.v2.step.error'] as string | undefined;

  const hasDetail = !!(removedHints || extractedParams || inputParams || enrichedFields || hintAnnotations);

  return (
    <div className={cn(
      'px-4 py-2 text-[11px]',
      isRetry ? 'bg-amber-50/50 dark:bg-amber-950/10' : '',
      !stepSuccess ? 'bg-red-50/50 dark:bg-red-950/10' : '',
    )}>
      {/* Step header row */}
      <div className="flex items-start gap-2.5">
        <StepIcon className={cn('size-3 mt-0.5 shrink-0', meta.iconClass)} />
        <span className={cn(
          'font-medium shrink-0',
          isRetry ? 'text-amber-700 dark:text-amber-300' : !stepSuccess ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground',
        )}>
          {meta.label}
        </span>
        {stepSummary && (
          <span className="text-muted-foreground/70 flex-1 min-w-0 truncate">{stepSummary}</span>
        )}
        <span className="ml-auto shrink-0 font-mono tabular-nums text-muted-foreground/50">{fmt(span.durationMs)}</span>
      </div>

      {/* Step detail content — only rendered when rich attributes are present */}
      {hasDetail && (
        <div className="ml-5 mt-1.5 space-y-1.5">
          {/* Context enrichment details */}
          {removedHints && (() => {
            const hints = tryParseJSON<string[]>(removedHints);
            return hints && hints.length > 0 ? (
              <div className="rounded-md bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 px-2.5 py-1.5">
                {hints.map((h, i) => (
                  <p key={i} className="text-[10px] text-amber-700 dark:text-amber-300">{h}</p>
                ))}
              </div>
            ) : null;
          })()}

          {enrichedFields && (
            <p className="text-[10px] text-muted-foreground/70">
              <span className="font-medium">Enriched fields:</span> {enrichedFields}
            </p>
          )}

          {/* Param extraction details */}
          {(query !== undefined || extractedParams) && (
            <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
                {query !== undefined && (
                  <div>
                    <span className="text-muted-foreground">query: </span>
                    <span className="font-mono font-medium">&ldquo;{query}&rdquo;</span>
                  </div>
                )}
                {filters && (() => {
                  const parsed = tryParseJSON<unknown>(filters);
                  return parsed != null ? (
                    <div>
                      <span className="text-muted-foreground">filters: </span>
                      <span className="font-mono font-medium">{parsed === null || (Array.isArray(parsed) && parsed.length === 0) ? 'none' : filters}</span>
                    </div>
                  ) : null;
                })()}
                {sort && (
                  <div>
                    <span className="text-muted-foreground">sort: </span>
                    <span className="font-mono font-medium">{sort === 'null' ? 'none' : sort}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Hint annotations (shown on param extraction step) */}
          {hintAnnotations && (() => {
            const annotations = tryParseJSON<string[]>(hintAnnotations);
            return annotations && annotations.length > 0 ? (
              <div className="rounded-md bg-amber-50/40 dark:bg-amber-950/10 border border-amber-200/40 dark:border-amber-800/20 px-2.5 py-1.5">
                <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400 mb-0.5">Hint corrections from validation:</p>
                {annotations.map((a, i) => (
                  <p key={i} className="text-[10px] text-amber-700/80 dark:text-amber-300/80">{a}</p>
                ))}
              </div>
            ) : null;
          })()}

          {/* Tool execution details */}
          {inputParams && stepId === 'tool_execution' && (
            <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
              <p className="text-[10px] text-muted-foreground/70 font-medium mb-0.5">Input params</p>
              <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-24 overflow-auto">
                {(() => { try { return JSON.stringify(JSON.parse(inputParams), null, 2); } catch { return inputParams; } })()}
              </pre>
            </div>
          )}

          {toolError && (
            <p className="text-[10px] text-red-600 dark:text-red-400">{toolError}</p>
          )}
        </div>
      )}
    </div>
  );
}

function PipelineOverview({
  steps,
  selectedIndex,
  onSelect,
}: {
  steps: TimelineStep[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="shrink-0 border-b bg-muted/10 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2.5">Pipeline</p>
      <div className="flex items-stretch gap-0.5 overflow-x-auto">
        {steps.map((step, i) => {
          const status = getPhaseStatus(step);
          const summary = getPhaseSummary(step);
          const isSelected = selectedIndex === i;
          const span = 'span' in step ? step.span : null;
          const duration = span?.durationMs;

          const label = step.kind === 'guardrail'
            ? 'Input guardrail'
            : step.kind === 'v2_phase'
            ? step.label
            : step.kind === 'ai_decision'
            ? 'AI decision'
            : step.kind === 'ai_response'
            ? 'AI response'
            : step.kind === 'tool_call'
            ? (getAttr(step.span, 'alpha.tool.name') ?? 'Tool call')
            : 'Step';

          const style = step.kind === 'guardrail'
            ? V2_PHASE_ICONS.input_guardrail
            : step.kind === 'v2_phase'
            ? (V2_PHASE_ICONS[step.phase] ?? { icon: Clock, iconClass: 'text-muted-foreground', accent: '' })
            : step.kind === 'ai_decision' || step.kind === 'ai_response'
            ? { icon: Bot, iconClass: 'text-violet-600 dark:text-violet-400', accent: 'border-violet-400' }
            : step.kind === 'tool_call'
            ? { icon: Wrench, iconClass: 'text-orange-600 dark:text-orange-400', accent: 'border-orange-400' }
            : { icon: Clock, iconClass: 'text-muted-foreground', accent: '' };

          const Icon = style.icon;

          const statusDot = status === 'error'
            ? 'bg-red-500'
            : status === 'short_circuit'
            ? 'bg-amber-500'
            : 'bg-green-500';

          return (
            <div key={i} className="flex items-center gap-0.5 min-w-0">
              {/* Connector line */}
              {i > 0 && (
                <div className={cn(
                  'w-6 h-px shrink-0',
                  status === 'error' ? 'bg-red-300 dark:bg-red-700' : 'bg-border',
                )} />
              )}
              {/* Phase chip */}
              <button
                onClick={() => onSelect(i)}
                className={cn(
                  'group relative flex flex-col items-center gap-1.5 rounded-lg px-4 py-2.5 min-w-[96px] transition-all text-center',
                  'hover:bg-muted/60',
                  isSelected
                    ? 'bg-muted ring-1 ring-border shadow-sm'
                    : 'bg-transparent',
                )}
              >
                <div className="relative">
                  <div className={cn(
                    'rounded-full p-2',
                    isSelected
                      ? style.iconClass.replace('text-', 'bg-').replace('-500', '-100').replace('-600', '-100').replace('dark:text-', 'dark:bg-').replace('-400', '-900/30')
                      : 'bg-muted/50',
                  )}>
                    <Icon className={cn('size-4', style.iconClass)} />
                  </div>
                  {/* Order badge */}
                  <span className={cn(
                    'absolute -top-1 -left-1 size-4 rounded-full flex items-center justify-center text-[9px] font-bold ring-2 ring-background',
                    isSelected
                      ? 'bg-foreground text-background'
                      : 'bg-muted-foreground/20 text-muted-foreground',
                  )}>
                    {i + 1}
                  </span>
                  {/* Status dot */}
                  <span className={cn('absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background', statusDot)} />
                </div>
                <span className={cn(
                  'text-xs font-medium leading-tight max-w-[100px] truncate',
                  isSelected ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  {label}
                </span>
                {duration !== undefined && (
                  <span className="text-[10px] font-mono text-muted-foreground/70 tabular-nums">{fmt(duration)}</span>
                )}
                {summary && (
                  <span className="text-[10px] text-muted-foreground/60 truncate max-w-[100px]">{summary}</span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase Detail — renders the selected phase content
// ─────────────────────────────────────────────────────────────────────────────

function PhaseDetail({ step, spans }: { step: TimelineStep | 'system_prompt'; spans: SpanDetail[] }) {
  if (step === 'system_prompt') {
    return (
      <div className="divide-y">
        <SystemPromptStep spans={spans} />
      </div>
    );
  }

  switch (step.kind) {
    case 'guardrail':
      return (
        <div className="divide-y">
          <GuardrailStep step={step} forceOpen />
        </div>
      );
    case 'v2_phase':
      return (
        <div className="divide-y">
          <V2PhaseStep step={step} forceOpen />
        </div>
      );
    case 'ai_decision':
      return (
        <div className="divide-y">
          <AiDecisionStep step={step} forceOpen />
        </div>
      );
    case 'ai_response':
      return (
        <div className="divide-y">
          <AiResponseStep step={step} forceOpen />
        </div>
      );
    case 'tool_call':
      return (
        <div className="divide-y">
          <ToolCallStep step={step} forceOpen />
        </div>
      );
    case 'embedding':
      return (
        <div className="px-5 py-4">
          <EmbeddingChip span={step.span} />
        </div>
      );
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TurnTimelineBody — pipeline overview + phase detail
// ─────────────────────────────────────────────────────────────────────────────

function TurnTimelineBody({ spans }: { spans: SpanDetail[] }) {
  const steps = buildNarrative(spans);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(steps.length > 0 ? 0 : null);

  if (steps.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No detailed steps recorded for this turn.
      </div>
    );
  }

  const selectedStep = selectedIndex !== null ? steps[selectedIndex] : null;

  return (
    <div className="flex flex-col h-full">
      {/* Pipeline overview rail — always visible */}
      <PipelineOverview
        steps={steps}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
      />

      {/* Selected phase detail — scrollable */}
      <div className="flex-1 overflow-auto pb-8">
        {selectedStep ? (
          <PhaseDetail step={selectedStep} spans={spans} />
        ) : (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            Select a pipeline phase above to view details.
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TurnTimeline — exported component
// ─────────────────────────────────────────────────────────────────────────────

interface TurnTimelineProps {
  rootSpan: SpanListItem;
  onClose: () => void;
}

export function TurnTimeline({ rootSpan, onClose }: TurnTimelineProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const { data: spans = [], isLoading } = useTraceSpans(rootSpan.traceId);

  const body = isLoading ? (
    <div className="space-y-3 p-5">
      {[72, 56, 88, 64].map((w, i) => (
        <Skeleton key={i} className={`h-12 w-[${w}%]`} />
      ))}
    </div>
  ) : (
    <TurnTimelineBody spans={spans} />
  );

  return (
    <>
      {/* Full-screen dialog */}
      <Dialog open={fullscreen} onOpenChange={(open) => !open && setFullscreen(false)}>
        <DialogContent className="flex! h-[96vh]! w-[96vw]! max-w-[96vw]! flex-col! gap-0! p-0! overflow-hidden rounded-xl!" showCloseButton={false}>
          <DialogTitle className="sr-only">Conversation Turn Detail</DialogTitle>
          <TurnHeader
            rootSpan={rootSpan}
            allSpans={spans}
            onClose={() => setFullscreen(false)}
            onMaximize={() => setFullscreen(false)}
          />
          <div className="flex-1 min-h-0">
            {body}
          </div>
        </DialogContent>
      </Dialog>

      {/* Inline panel */}
      <div className="flex h-full flex-col overflow-hidden">
        <TurnHeader
          rootSpan={rootSpan}
          allSpans={spans}
          onClose={onClose}
          onMaximize={() => setFullscreen(true)}
        />
        <div className="flex-1 min-h-0">
          {body}
        </div>
      </div>
    </>
  );
}
