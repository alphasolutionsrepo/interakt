'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  Bot,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  History,
  Maximize2,
  MessageSquare,
  Search,
  Wrench,
  X,
  Zap,
  ShieldCheck,
} from 'lucide-react';
import type { SpanDetail } from '../_lib/api-client';
import { useSpanDetail } from '../_lib/hooks/useTraces';
import { TraceWaterfall } from './TraceWaterfall';

interface SpanDetailPanelProps {
  spanId: string | null;
  onClose: () => void;
}

// Attribute keys (mirrors backend ATTR)
const A = {
  CHAT_USER_MESSAGE: 'alpha.chat.user_message',
  CHAT_AI_DECISION: 'alpha.chat.ai_decision_type',
  CHAT_RESPONSE_PRESET: 'alpha.chat.response_preset',
  CHAT_CONTEXT_SOURCE: 'alpha.chat.context_source',
  AI_PROVIDER_KEY: 'alpha.ai.provider_key',
  AI_MODEL_KEY: 'alpha.ai.model_key',
  AI_OPERATION: 'alpha.ai.operation',
  AI_STREAMING: 'alpha.ai.streaming',
  AI_HAS_TOOLS: 'alpha.ai.has_tools',
  AI_INPUT_TOKENS: 'alpha.ai.input_tokens',
  AI_OUTPUT_TOKENS: 'alpha.ai.output_tokens',
  AI_TOTAL_TOKENS: 'alpha.ai.total_tokens',
  AI_TIME_TO_FIRST_TOKEN: 'alpha.ai.time_to_first_token_ms',
  SEARCH_QUERY: 'alpha.search.query',
  SEARCH_TYPE: 'alpha.search.type',
  SEARCH_INDEX_NAME: 'alpha.search.index_name',
  SEARCH_TOTAL_RESULTS: 'alpha.search.total_results',
  SEARCH_RETURNED: 'alpha.search.results_returned',
  SEARCH_TRIGGER: 'alpha.search.trigger_type',
  SEARCH_ES_TOOK_MS: 'alpha.search.es_took_ms',
  TOOL_NAME: 'alpha.tool.name',
  TOOL_TYPE: 'alpha.tool.type',
  TOOL_SUCCESS: 'alpha.tool.success',
  TOOL_CALL_COUNT: 'alpha.tool.call_count',
  ERROR_CODE: 'alpha.error.code',
  ERROR_MESSAGE: 'alpha.error.message',
  PIPELINE_TYPE: 'alpha.pipeline.type',
  PIPELINE_PHASE: 'alpha.pipeline.phase',
  EXPERIENCE_TYPE: 'alpha.experience.type',
  EXPERIENCE_SLUG: 'alpha.experience.slug',
  CHAT_SESSION_ID: 'alpha.chat.session_id',
  // V2 Guardrail
  V2_GUARDRAIL_CLASSIFICATION: 'alpha.v2.guardrail.classification',
  V2_GUARDRAIL_GREETING_REGEX: 'alpha.v2.guardrail.greeting_regex_matched',
  V2_GUARDRAIL_DOMAIN_FILTER_ENABLED: 'alpha.v2.guardrail.domain_filter_enabled',
  V2_GUARDRAIL_DOMAIN_SIMILARITY: 'alpha.v2.guardrail.domain_similarity',
  V2_GUARDRAIL_GENERAL_SIMILARITY: 'alpha.v2.guardrail.general_similarity',
  V2_GUARDRAIL_CLOSEST_DOMAIN_TERM: 'alpha.v2.guardrail.closest_domain_term',
  V2_GUARDRAIL_CLOSEST_GENERAL_TERM: 'alpha.v2.guardrail.closest_general_term',
  V2_GUARDRAIL_SHORT_CIRCUITED: 'alpha.v2.guardrail.short_circuited',
  V2_GUARDRAIL_BLOCKLIST_MATCHED: 'alpha.v2.guardrail.blocklist_matched',
};

const SHOWN_ATTR_KEYS = new Set(Object.values(A));

// ============================================================================
// Helpers
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString();
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  return String(v);
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

export function humanizeOpName(name: string): string {
  const labels: Record<string, string> = {
    'chat.ai_experience.turn': 'AI Experience Turn',
    'chat.search_experience.turn': 'Search Experience Turn',
    'chat.deterministic.turn': 'Deterministic Pipeline Turn',
    'ai.chat': 'AI Chat',
    'ai.stream_chat': 'AI Chat (Streaming)',
    'ai.generate_text': 'AI Text Generation',
    'ai.generate_embeddings': 'AI Embeddings',
    'search.execute': 'Search',
    'tool.execute': 'Tool Execution',
  };
  if (name in labels) return labels[name];
  if (name.startsWith('pipeline.')) return `Pipeline Phase: ${name.slice(9)}`;
  return name;
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
}

// ============================================================================
// Sub-components
// ============================================================================

function InfoRow({ label, value }: { label: string; value: string | undefined | null }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 text-xs text-muted-foreground w-28 pt-px">{label}</span>
      <span className="break-all text-xs font-medium leading-relaxed">{value}</span>
    </div>
  );
}

function MetricTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 text-center shadow-sm">
      <div className="text-lg font-bold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  iconClass,
  accent,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ElementType;
  iconClass?: string;
  accent?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn('border-b last:border-b-0', accent && open ? `border-l-2 ${accent}` : '')}>
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-5 py-3 text-left transition-colors hover:bg-muted/40"
        onClick={() => setOpen(!open)}
      >
        <Icon className={cn('size-3.5 shrink-0', iconClass ?? 'text-muted-foreground')} />
        <span className="flex-1 text-sm font-semibold">{title}</span>
        {open ? (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground" />
        )}
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

// ============================================================================
// SpanDetailSections — renders all sections for a given span
// ============================================================================

function SpanDetailSections({ span }: { span: SpanDetail }) {
  const attrs = span.attributes ?? {};
  const events = span.events ?? [];
  const isError = span.statusCode === 'ERROR';

  const userMessage = str(attrs[A.CHAT_USER_MESSAGE]);
  const aiModel = str(attrs[A.AI_MODEL_KEY]);
  const aiProvider = str(attrs[A.AI_PROVIDER_KEY]);
  const aiStreaming = attrs[A.AI_STREAMING];
  const inputTokens = num(attrs[A.AI_INPUT_TOKENS]);
  const outputTokens = num(attrs[A.AI_OUTPUT_TOKENS]);
  const totalTokens = num(attrs[A.AI_TOTAL_TOKENS]);
  const ttft = num(attrs[A.AI_TIME_TO_FIRST_TOKEN]);
  const searchQuery = str(attrs[A.SEARCH_QUERY]);
  const searchType = str(attrs[A.SEARCH_TYPE]);
  const searchIndex = str(attrs[A.SEARCH_INDEX_NAME]);
  const searchTotal = num(attrs[A.SEARCH_TOTAL_RESULTS]);
  const searchReturned = num(attrs[A.SEARCH_RETURNED]);
  const searchEsTook = num(attrs[A.SEARCH_ES_TOOK_MS]);
  const searchTrigger = str(attrs[A.SEARCH_TRIGGER]);
  const toolName = str(attrs[A.TOOL_NAME]);
  const toolType = str(attrs[A.TOOL_TYPE]);
  const toolSuccess = attrs[A.TOOL_SUCCESS];
  const toolCallCount = num(attrs[A.TOOL_CALL_COUNT]);
  const errCode = str(attrs[A.ERROR_CODE]);
  const errMessage = str(attrs[A.ERROR_MESSAGE]);
  const pipelineType = str(attrs[A.PIPELINE_TYPE]) ?? span.pipelineType ?? undefined;
  const pipelinePhase = str(attrs[A.PIPELINE_PHASE]);
  const experienceType = str(attrs[A.EXPERIENCE_TYPE]) ?? span.experienceType ?? undefined;
  const experienceSlug = str(attrs[A.EXPERIENCE_SLUG]);
  const sessionId = str(attrs[A.CHAT_SESSION_ID]) ?? span.sessionId ?? undefined;
  const contextSource = str(attrs[A.CHAT_CONTEXT_SOURCE]);
  const aiDecision = str(attrs[A.CHAT_AI_DECISION]);
  const responsePreset = str(attrs[A.CHAT_RESPONSE_PRESET]);

  const hasAI = !!(aiModel ?? aiProvider ?? inputTokens !== undefined);
  const hasSearch = !!(searchQuery ?? searchType);
  const hasTool = !!toolName;
  const hasError = isError || !!(errCode ?? errMessage);

  // Partition events by name so each gets a purpose-built section
  const KNOWN_EVENT_NAMES = new Set([
    'exception',
    'ai.messages_sent', 'ai.response',
    'tool.input', 'tool.output',
    'context.system_prompt', 'context.history',
  ]);
  const exceptionEvents = events.filter((e) => e.name === 'exception');
  const msgsSentEvent = events.find((e) => e.name === 'ai.messages_sent');
  const responseEvent = events.find((e) => e.name === 'ai.response');
  const toolInputEvent = events.find((e) => e.name === 'tool.input');
  const toolOutputEvent = events.find((e) => e.name === 'tool.output');
  const systemPromptEvent = events.find((e) => e.name === 'context.system_prompt');
  const historyEvent = events.find((e) => e.name === 'context.history');
  const otherEvents = events.filter((e) => !KNOWN_EVENT_NAMES.has(e.name));

  // Parse messages array from event (safe)
  function parseMsgs(raw: unknown): Array<{ role: string; content: string; tool_calls?: Array<{ name: string; input: unknown }> }> {
    try { return JSON.parse(String(raw)); } catch { return []; }
  }
  function parseToolCalls(raw: unknown): Array<{ name: string; input: unknown }> {
    try { return JSON.parse(String(raw)); } catch { return []; }
  }

  const roleStyle: Record<string, string> = {
    system: 'bg-muted/40 border border-muted text-muted-foreground',
    user: 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800',
    assistant: 'bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800',
    tool: 'bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800',
  };
  const roleLabel: Record<string, string> = {
    system: 'System',
    user: 'User',
    assistant: 'Assistant',
    tool: 'Tool Result',
  };
  const rawAttrs = Object.entries(attrs).filter(([k]) => !SHOWN_ATTR_KEYS.has(k));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div>
        {/* User Message */}
        {userMessage && (
          <Section title="User Message" icon={MessageSquare} iconClass="text-blue-500" accent="border-blue-400">
            <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-4 py-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{userMessage}</p>
            </div>
            {(aiDecision ?? responsePreset) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {aiDecision && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>Decision</span>
                    <Badge variant="secondary" className="text-[11px] font-medium">{aiDecision}</Badge>
                  </div>
                )}
                {responsePreset && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>Preset</span>
                    <Badge variant="outline" className="text-[11px]">{responsePreset}</Badge>
                  </div>
                )}
              </div>
            )}
          </Section>
        )}

        {/* Guardrail & Classification */}
        {str(attrs[A.V2_GUARDRAIL_CLASSIFICATION]) && (() => {
          const classification = str(attrs[A.V2_GUARDRAIL_CLASSIFICATION])!;
          const greetingRegex = attrs[A.V2_GUARDRAIL_GREETING_REGEX];
          const domainFilterEnabled = attrs[A.V2_GUARDRAIL_DOMAIN_FILTER_ENABLED];
          const domainSim = num(attrs[A.V2_GUARDRAIL_DOMAIN_SIMILARITY]);
          const generalSim = num(attrs[A.V2_GUARDRAIL_GENERAL_SIMILARITY]);
          const closestDomain = str(attrs[A.V2_GUARDRAIL_CLOSEST_DOMAIN_TERM]);
          const closestGeneral = str(attrs[A.V2_GUARDRAIL_CLOSEST_GENERAL_TERM]);
          const shortCircuited = attrs[A.V2_GUARDRAIL_SHORT_CIRCUITED];
          const blocklistMatched = attrs[A.V2_GUARDRAIL_BLOCKLIST_MATCHED];

          const colorMap: Record<string, string> = {
            blocked: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20',
            greeting: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
            general: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
            off_topic: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
            domain: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20',
          };
          const badgeClass = colorMap[classification] ?? colorMap.domain;

          return (
            <Section title="Guardrail & Classification" icon={ShieldCheck} iconClass="text-red-500" accent="border-red-300">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${badgeClass}`}>
                    {classification}
                  </span>
                  {shortCircuited === true && (
                    <Badge variant="secondary" className="text-[10px]">short-circuited</Badge>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md bg-muted/50 px-3 py-1.5">
                    <span className="text-muted-foreground">Greeting regex:</span>{' '}
                    <span className="font-medium">{greetingRegex === true ? 'matched' : 'no'}</span>
                  </div>
                  <div className="rounded-md bg-muted/50 px-3 py-1.5">
                    <span className="text-muted-foreground">Domain filter:</span>{' '}
                    <span className="font-medium">{domainFilterEnabled === true ? 'on' : 'off'}</span>
                  </div>
                  <div className="rounded-md bg-muted/50 px-3 py-1.5">
                    <span className="text-muted-foreground">Blocklist:</span>{' '}
                    <span className="font-medium">{blocklistMatched === true ? 'matched' : 'clear'}</span>
                  </div>
                </div>
                {domainSim !== undefined && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-violet-500/5 border border-violet-500/10 px-3 py-2">
                      <p className="text-muted-foreground text-[10px] uppercase tracking-wider font-medium mb-0.5">Domain similarity</p>
                      <p className="font-semibold text-violet-700 dark:text-violet-300">{domainSim}</p>
                      {closestDomain && <p className="text-muted-foreground mt-0.5">closest: {closestDomain}</p>}
                    </div>
                    <div className="rounded-md bg-sky-500/5 border border-sky-500/10 px-3 py-2">
                      <p className="text-muted-foreground text-[10px] uppercase tracking-wider font-medium mb-0.5">General similarity</p>
                      <p className="font-semibold text-sky-700 dark:text-sky-300">{generalSim ?? '—'}</p>
                      {closestGeneral && <p className="text-muted-foreground mt-0.5">closest: {closestGeneral}</p>}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          );
        })()}

        {/* Error */}
        {hasError && (
          <Section title="Error" icon={AlertCircle} iconClass="text-destructive" accent="border-destructive">
            <div className="rounded-xl bg-destructive/5 border border-destructive/20 px-4 py-3 space-y-2">
              {span.statusMessage && (
                <p className="text-sm font-semibold text-destructive">{span.statusMessage}</p>
              )}
              {errCode && (
                <div className="inline-flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs font-mono font-medium text-destructive">
                  {errCode}
                </div>
              )}
              {errMessage && <p className="text-xs text-muted-foreground">{errMessage}</p>}
              {exceptionEvents.map((ev, i) => (
                <div key={i} className="mt-3 border-t border-destructive/20 pt-3 space-y-1.5">
                  {str(ev.attributes['exception.type']) && (
                    <p className="text-xs font-bold text-destructive">
                      {str(ev.attributes['exception.type'])}
                    </p>
                  )}
                  {str(ev.attributes['exception.message']) && (
                    <p className="text-xs text-muted-foreground">
                      {str(ev.attributes['exception.message'])}
                    </p>
                  )}
                  {str(ev.attributes['exception.stacktrace']) && (
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-muted/60 p-3 text-[11px] leading-relaxed font-mono">
                      {str(ev.attributes['exception.stacktrace'])}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* AI Model */}
        {hasAI && (
          <Section title="AI Model" icon={Bot} iconClass="text-violet-500" accent="border-violet-400">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {aiModel && (
                  <Badge variant="secondary" className="font-mono text-sm px-3 py-1">
                    {aiModel}
                  </Badge>
                )}
                {aiProvider && (
                  <Badge variant="outline" className="text-xs capitalize">
                    {aiProvider}
                  </Badge>
                )}
                {aiStreaming && (
                  <Badge variant="outline" className="text-[11px] text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                    <Zap className="mr-1 size-2.5" />
                    streaming
                  </Badge>
                )}
              </div>
              {(inputTokens !== undefined || outputTokens !== undefined || totalTokens !== undefined) && (
                <div className="grid grid-cols-3 gap-3">
                  <MetricTile label="Input" value={inputTokens !== undefined ? String(inputTokens) : '—'} sub="tokens" />
                  <MetricTile label="Output" value={outputTokens !== undefined ? String(outputTokens) : '—'} sub="tokens" />
                  <MetricTile label="Total" value={totalTokens !== undefined ? String(totalTokens) : '—'} sub="tokens" />
                </div>
              )}
              {ttft !== undefined && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground text-xs">Time to first token</span>
                  <span className="font-semibold text-sm">{formatDuration(ttft)}</span>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Search */}
        {hasSearch && (
          <Section title="Search" icon={Search} iconClass="text-emerald-500" accent="border-emerald-400">
            <div className="space-y-3">
              {searchQuery && (
                <div className="rounded-lg border bg-muted/30 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Query</p>
                  <p className="text-sm font-semibold">{searchQuery}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <InfoRow label="Type" value={searchType} />
                <InfoRow label="Index" value={searchIndex} />
                <InfoRow label="Total results" value={searchTotal !== undefined ? String(searchTotal) : undefined} />
                <InfoRow label="Returned" value={searchReturned !== undefined ? String(searchReturned) : undefined} />
                <InfoRow label="ES took" value={searchEsTook !== undefined ? `${searchEsTook}ms` : undefined} />
                <InfoRow label="Trigger" value={searchTrigger} />
              </div>
            </div>
          </Section>
        )}

        {/* Tool */}
        {hasTool && (
          <Section title="Tool Execution" icon={Wrench} iconClass="text-orange-500" accent="border-orange-400">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-bold">{toolName}</span>
                {toolType && (
                  <Badge variant="outline" className="text-[11px]">{toolType}</Badge>
                )}
                {toolSuccess !== undefined && (
                  <Badge
                    variant={toolSuccess ? 'success' : 'destructive'}
                    className="text-[11px]"
                  >
                    {toolSuccess ? '✓ Success' : '✗ Failed'}
                  </Badge>
                )}
              </div>
              {toolInputEvent && (
                <div>
                  <p className="mb-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Input</p>
                  <pre className="max-h-40 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-all">
                    {String(toolInputEvent.attributes.input ?? '')}
                  </pre>
                </div>
              )}
              {toolOutputEvent && (
                <div>
                  <p className="mb-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Output</p>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-all">
                    {String(toolOutputEvent.attributes.output ?? '')}
                  </pre>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Messages Sent to AI */}
        {msgsSentEvent && (
          <Section title="Messages Sent to AI" icon={History} iconClass="text-violet-500" accent="border-violet-400">
            <div className="space-y-2">
              {parseMsgs(msgsSentEvent.attributes.messages).map((msg, i) => (
                <div key={i} className={`rounded-lg px-3 py-2.5 ${roleStyle[msg.role] ?? 'bg-muted/20 border'}`}>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider opacity-60">
                    {roleLabel[msg.role] ?? msg.role}
                  </p>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap wrap-break-word">{msg.content}</p>
                  {msg.tool_calls && msg.tool_calls.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {msg.tool_calls.map((tc, j) => (
                        <div key={j} className="rounded-md bg-background/60 px-2 py-1.5 text-[11px] font-mono">
                          <span className="font-semibold text-orange-600">{tc.name}</span>
                          <span className="ml-2 text-muted-foreground">{JSON.stringify(tc.input)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* AI Response */}
        {responseEvent && (
          <Section title="AI Response" icon={Bot} iconClass="text-violet-500" accent="border-violet-400" defaultOpen={true}>
            <div className="space-y-3">
              {String(responseEvent.attributes.text ?? '').trim() && (
                <div className="rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 px-4 py-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {String(responseEvent.attributes.text)}
                  </p>
                </div>
              )}
              {parseToolCalls(responseEvent.attributes.tool_calls).length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Tool Calls Requested</p>
                  <div className="space-y-1.5">
                    {parseToolCalls(responseEvent.attributes.tool_calls).map((tc, i) => (
                      <div key={i} className="rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 px-3 py-2 text-xs font-mono">
                        <span className="font-bold text-orange-700 dark:text-orange-400">{tc.name}</span>
                        <pre className="mt-1 text-[11px] text-muted-foreground whitespace-pre-wrap break-all">
                          {JSON.stringify(tc.input, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* System Prompt */}
        {systemPromptEvent && (
          <Section title="System Prompt" icon={FileText} iconClass="text-slate-500" defaultOpen={false}>
            <div className="rounded-lg bg-muted/40 border px-4 py-3">
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {String(systemPromptEvent.attributes.prompt ?? '')}
              </p>
            </div>
          </Section>
        )}

        {/* Context */}
        {(experienceType ?? pipelineType ?? sessionId ?? contextSource ?? experienceSlug ?? historyEvent) && (
          <Section title="Context" icon={Clock} defaultOpen={false}>
            <div className="grid gap-2">
              <InfoRow label="Experience type" value={experienceType} />
              <InfoRow label="Experience" value={experienceSlug} />
              <InfoRow label="Pipeline" value={pipelineType} />
              <InfoRow label="Session ID" value={sessionId} />
              <InfoRow label="Context source" value={contextSource} />
              {historyEvent && (
                <InfoRow
                  label="History"
                  value={`${historyEvent.attributes.count} previous message${Number(historyEvent.attributes.count) !== 1 ? 's' : ''}`}
                />
              )}
            </div>
          </Section>
        )}

        {/* Other Events (unrecognised) */}
        {otherEvents.length > 0 && (
          <Section title={`Events (${otherEvents.length})`} icon={Zap} defaultOpen={false}>
            <div className="space-y-2">
              {otherEvents.map((ev, i) => (
                <div key={i} className="rounded-lg border bg-muted/20 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-semibold">{ev.name}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatTimestamp(ev.timestamp)}
                    </span>
                  </div>
                  {Object.entries(ev.attributes).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-muted-foreground mt-1">
                      <span className="font-mono shrink-0 text-[10px]">{k}:</span>
                      <span className="break-all">{renderValue(v)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Technical Details */}
        <Section title="Technical Details" icon={ChevronRight} defaultOpen={false}>
          <div className="space-y-2">
            <InfoRow label="Trace ID" value={span.traceId} />
            <InfoRow label="Span ID" value={span.spanId} />
            <InfoRow label="Parent Span" value={span.parentSpanId ?? undefined} />
            <InfoRow label="Service" value={span.serviceName} />
            <InfoRow label="Span Kind" value={span.spanKind} />
            <InfoRow label="Start" value={formatTimestamp(span.startTime)} />
            <InfoRow label="End" value={formatTimestamp(span.endTime)} />
            {rawAttrs.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <p className="mb-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Other Attributes
                </p>
                <div className="space-y-1.5">
                  {rawAttrs.map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-xs">
                      <span className="shrink-0 font-mono text-muted-foreground w-44 truncate" title={k}>
                        {k}
                      </span>
                      <span className="break-all text-foreground">{renderValue(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

// ============================================================================
// SpanDetailContent — fetches a span by ID and renders its sections.
// Used in the full-screen dialog so clicking a waterfall span updates the left panel.
// ============================================================================

function SpanDetailContent({ spanId }: { spanId: string | null }) {
  const { data: span, isLoading } = useSpanDetail(spanId);

  if (!spanId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Click a span in the waterfall to inspect it.
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (!span) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Span not found.
      </div>
    );
  }

  const attrs = span.attributes ?? {};
  const isError = span.statusCode === 'ERROR';
  const pipelineType = str(attrs[A.PIPELINE_TYPE]) ?? span.pipelineType ?? undefined;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Selected span mini-header */}
      <div className="shrink-0 border-b px-5 py-4">
        <h4 className="text-sm font-bold leading-tight" title={span.operationName}>
          {humanizeOpName(span.operationName)}
        </h4>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge
            variant={isError ? 'destructive' : 'success'}
            className="text-[10px] uppercase"
          >
            {isError ? 'Error' : 'OK'}
          </Badge>
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {formatDuration(span.durationMs)}
          </span>
          {pipelineType && (
            <Badge variant="outline" className="text-[10px]">
              {pipelineType}
            </Badge>
          )}
        </div>
      </div>
      <SpanDetailSections span={span} />
    </div>
  );
}

// ============================================================================
// SpanDetailHeader — top bar for the compact side panel
// ============================================================================

function SpanDetailHeader({
  span,
  onMaximize,
  onClose,
}: {
  span: SpanDetail;
  onMaximize: () => void;
  onClose: () => void;
}) {
  const attrs = span.attributes ?? {};
  const isError = span.statusCode === 'ERROR';
  const pipelineType = str(attrs[A.PIPELINE_TYPE]) ?? span.pipelineType ?? undefined;
  const pipelinePhase = str(attrs[A.PIPELINE_PHASE]);

  return (
    <div className="flex shrink-0 items-start gap-2 border-b px-4 py-3">
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold" title={span.operationName}>
          {humanizeOpName(span.operationName)}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3" />
          <span className="font-mono tabular-nums">{formatDuration(span.durationMs)}</span>
          <Badge variant={isError ? 'destructive' : 'success'} className="text-[10px] uppercase">
            {isError ? 'Error' : 'OK'}
          </Badge>
          {pipelineType && (
            <Badge variant="outline" className="text-[10px]">
              {pipelineType}
            </Badge>
          )}
          {pipelinePhase && (
            <Badge variant="secondary" className="text-[10px]">
              phase: {pipelinePhase}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          title="Full screen"
          onClick={onMaximize}
        >
          <Maximize2 className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// SpanDetailPanel — main exported component
// ============================================================================

export function SpanDetailPanel({ spanId, onClose }: SpanDetailPanelProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenSelectedId, setFullscreenSelectedId] = useState<string | null>(null);
  const { data: span, isLoading, error } = useSpanDetail(spanId);

  if (!spanId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a conversation to view details.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error || !span) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <p>Failed to load span details.</p>
        <p className="text-xs text-destructive">{error?.message}</p>
      </div>
    );
  }

  const activeDetailId = fullscreenSelectedId ?? spanId;

  return (
    <>
      {/* ── Full-screen dialog ── */}
      <Dialog
        open={fullscreen}
        onOpenChange={(open) => {
          if (!open) {
            setFullscreen(false);
            setFullscreenSelectedId(null);
          }
        }}
      >
        <DialogContent
          className="flex! h-[96vh]! w-[96vw]! max-w-[96vw]! flex-col! gap-0! p-0! overflow-hidden rounded-xl!"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">
            Span Detail — {humanizeOpName(span.operationName)}
          </DialogTitle>

          {/* Dialog header bar */}
          <div className="flex shrink-0 items-center gap-3 border-b bg-muted/30 px-6 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold">
                  {humanizeOpName(span.operationName)}
                </span>
                <Badge
                  variant={span.statusCode === 'ERROR' ? 'destructive' : 'success'}
                  className="text-[11px] uppercase"
                >
                  {span.statusCode === 'ERROR' ? 'Error' : 'OK'}
                </Badge>
                <span className="text-sm font-mono text-muted-foreground tabular-nums">
                  {formatDuration(span.durationMs)}
                </span>
                {(() => {
                  const pt = str(span.attributes?.[A.PIPELINE_TYPE]) ?? span.pipelineType;
                  return pt ? (
                    <Badge variant="outline" className="text-[11px]">{pt}</Badge>
                  ) : null;
                })()}
              </div>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                trace: {span.traceId}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => {
                setFullscreen(false);
                setFullscreenSelectedId(null);
              }}
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Stacked body: compact waterfall on top for navigation, full-width detail below */}
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Top: trace waterfall — click spans to navigate */}
            <div className="flex shrink-0 flex-col overflow-hidden border-b bg-muted/10" style={{ height: '34%' }}>
              <div className="flex shrink-0 items-center gap-2 border-b bg-background px-4 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trace Spans</span>
                <Badge variant="secondary" className="text-[10px]">click to inspect</Badge>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <TraceWaterfall
                  traceId={span.traceId}
                  selectedSpanId={activeDetailId}
                  onSelectSpan={(s) => setFullscreenSelectedId(s.id)}
                  onClose={() => {
                    setFullscreen(false);
                    setFullscreenSelectedId(null);
                  }}
                  showHeader={false}
                />
              </div>
            </div>

            {/* Bottom: full-width span detail — no column splitting, no content cut-off */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <SpanDetailContent spanId={activeDetailId} />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Compact side panel ── */}
      <div className="flex h-full flex-col overflow-hidden">
        <SpanDetailHeader
          span={span}
          onMaximize={() => {
            setFullscreen(true);
            setFullscreenSelectedId(null);
          }}
          onClose={onClose}
        />
        <SpanDetailSections span={span} />
      </div>
    </>
  );
}
