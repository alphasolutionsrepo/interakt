'use client';

import { useRef, useState } from 'react';
import { Bot, ChevronDown, ChevronUp, ImageIcon, Loader2, MessageSquare, Send, Sparkles, Trash2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ============================================================================
// TYPES
// ============================================================================

interface ToolCallEntry {
  id: string;
  name: string;
  displayName: string;
  input: Record<string, unknown>;
  success?: boolean;
  durationMs?: number;
  done: boolean;
}

interface PresetData {
  preset: string;
  items: Array<{ id?: string; fields: Record<string, unknown> }>;
  displayConfig: {
    fields: Array<{
      source: string;
      role: 'title' | 'subtitle' | 'image' | 'price' | 'description' | 'rating' | 'badge' | 'link' | 'secondary';
      label?: string;
      format?: 'text' | 'currency' | 'stars' | 'date' | 'badge' | 'image_url' | 'link_url';
      currency?: string;
      priority?: 'primary' | 'secondary';
    }>;
    preferredPresets?: string[];
  };
}

interface AssistantMessage {
  role: 'assistant';
  id: string;
  content: string;
  toolCalls: ToolCallEntry[];
  /** Current pipeline step label (e.g. "Loading context", "Planning actions") */
  pipelineStep?: string;
  /** Classification result from input guardrail */
  classification?: string;
  /** Whether the message was short-circuited (didn't go through full pipeline) */
  shortCircuited?: boolean;
  /** Visual preset data from pipeline response synthesis */
  presetData?: PresetData;
}

interface UserMessage {
  role: 'user';
  id: string;
  content: string;
}

type ChatMessage = UserMessage | AssistantMessage;

interface SSEEvent {
  type: 'content' | 'tool_call' | 'tool_result' | 'done' | 'error' | 'step_start' | 'step_complete' | 'preset' | 'sources' | 'classification';
  text?: string;
  content?: string;
  // tool_call / tool_result fields
  id?: string;
  name?: string;
  displayName?: string;
  arguments?: Record<string, unknown>;
  input?: Record<string, unknown>; // legacy fallback
  success?: boolean;
  resultCount?: number;
  durationMs?: number;
  sessionId?: string;
  message?: string;
  // step_start / step_complete fields
  stepId?: string;
  stepName?: string;
  stepType?: string;
  status?: string;
  // preset fields
  preset?: string;
  data?: unknown;
  // classification fields
  classification?: string;
  debug?: { shortCircuited?: boolean; [key: string]: unknown };
}

// ============================================================================
// TOOL CALL CHIP
// ============================================================================

function ToolCallChip({ toolCall }: { toolCall: ToolCallEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 text-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Wrench className="size-3 text-orange-500 shrink-0" />
        <span className="font-medium flex-1">{toolCall.displayName}</span>
        {toolCall.done ? (
          <Badge
            variant="outline"
            className={`text-[10px] rounded-md px-1.5 py-0 ${
              toolCall.success
                ? 'text-emerald-600 border-emerald-500/30 bg-emerald-500/5'
                : 'text-destructive border-destructive/30 bg-destructive/5'
            }`}
          >
            {toolCall.success ? 'ok' : 'failed'}{' '}
            {toolCall.durationMs != null ? `${toolCall.durationMs}ms` : ''}
          </Badge>
        ) : (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        )}
        {open ? <ChevronUp className="size-3 text-muted-foreground" /> : <ChevronDown className="size-3 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t border-border/40 px-3 pb-2 pt-1">
          <p className="text-[10px] text-muted-foreground mb-0.5 font-semibold uppercase tracking-wide">Input</p>
          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all">
            {JSON.stringify(toolCall.input, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CLASSIFICATION BADGE
// ============================================================================

const CLASSIFICATION_BADGE_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  blocked: { bg: 'bg-red-500/10 border-red-500/20', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' },
  greeting: { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  general: { bg: 'bg-sky-500/10 border-sky-500/20', text: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
  off_topic: { bg: 'bg-slate-500/10 border-slate-500/20', text: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-400' },
  domain: { bg: 'bg-violet-500/10 border-violet-500/20', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
};

function ClassificationBadge({ classification, shortCircuited }: { classification: string; shortCircuited?: boolean }) {
  const style = CLASSIFICATION_BADGE_STYLES[classification] ?? CLASSIFICATION_BADGE_STYLES.domain;
  const routing = shortCircuited ? 'Lightweight' : 'Full Pipeline';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${style.bg} ${style.text}`}>
      <span className={`size-1.5 rounded-full ${style.dot}`} />
      {classification} → {routing}
    </span>
  );
}

// ============================================================================
// PRESET RENDERER (compact version for test chat)
// ============================================================================

function getPresetField(
  item: PresetData['items'][0],
  config: PresetData['displayConfig'],
  role: string,
) {
  const f = config.fields.find((f) => f.role === role);
  if (!f) return null;
  const val = item.fields[f.source];
  if (val === undefined || val === null || val === '') return null;
  return { value: val, field: f };
}

function formatPresetValue(value: unknown, field: PresetData['displayConfig']['fields'][0]): string {
  if (value === undefined || value === null) return '';
  if (field.format === 'currency') {
    const num = typeof value === 'number' ? value : parseFloat(String(value));
    if (isNaN(num)) return String(value);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: field.currency || 'USD' }).format(num);
  }
  return String(value);
}

function ChatPresetRenderer({ data }: { data: PresetData }) {
  const { preset, items, displayConfig } = data;

  if (preset === 'single_card') {
    const item = items[0];
    const title = getPresetField(item, displayConfig, 'title');
    const subtitle = getPresetField(item, displayConfig, 'subtitle');
    const image = getPresetField(item, displayConfig, 'image');
    const price = getPresetField(item, displayConfig, 'price');
    const description = getPresetField(item, displayConfig, 'description');
    const badge = getPresetField(item, displayConfig, 'badge');

    return (
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="w-full h-36 bg-muted relative">
          {image ? (
            <img src={String(image.value)} alt={title ? String(title.value) : ''} className="w-full h-full object-cover" onError={(e) => { const el = e.target as HTMLImageElement; el.style.display = 'none'; el.nextElementSibling?.classList.remove('hidden'); }} />
          ) : null}
          <div className={`w-full h-full flex items-center justify-center absolute inset-0 ${image ? 'hidden' : ''}`}>
            <ImageIcon className="size-8 text-muted-foreground/20" />
          </div>
        </div>
        <div className="p-3 space-y-1.5">
          {badge && <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{formatPresetValue(badge.value, badge.field)}</span>}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {title && <h4 className="text-sm font-semibold truncate">{String(title.value)}</h4>}
              {subtitle && <p className="text-xs text-muted-foreground truncate">{String(subtitle.value)}</p>}
            </div>
            {price && <span className="text-sm font-bold shrink-0">{formatPresetValue(price.value, price.field)}</span>}
          </div>
          {description && <p className="text-xs text-muted-foreground line-clamp-2">{String(description.value)}</p>}
        </div>
      </div>
    );
  }

  if (preset === 'item_grid') {
    return (
      <div className="grid grid-cols-2 gap-2">
        {items.slice(0, 6).map((item, i) => {
          const title = getPresetField(item, displayConfig, 'title');
          const image = getPresetField(item, displayConfig, 'image');
          const price = getPresetField(item, displayConfig, 'price');
          const badge = getPresetField(item, displayConfig, 'badge');
          return (
            <div key={item.id ?? i} className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
              <div className="w-full h-24 bg-muted relative">
                {image ? (
                  <img src={String(image.value)} alt={title ? String(title.value) : ''} className="w-full h-full object-cover" onError={(e) => { const el = e.target as HTMLImageElement; el.style.display = 'none'; el.parentElement?.querySelector('.placeholder')?.classList.remove('hidden'); }} />
                ) : null}
                <div className={`placeholder w-full h-full flex items-center justify-center absolute inset-0 ${image ? 'hidden' : ''}`}>
                  <ImageIcon className="size-6 text-muted-foreground/20" />
                </div>
                {badge && <span className="absolute top-1 left-1 text-[9px] font-medium px-1 py-0.5 rounded bg-black/70 text-white z-10">{formatPresetValue(badge.value, badge.field)}</span>}
              </div>
              <div className="p-2 space-y-0.5">
                {title && <h4 className="text-xs font-semibold truncate">{String(title.value)}</h4>}
                {price && <span className="text-xs font-bold">{formatPresetValue(price.value, price.field)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (preset === 'item_list') {
    return (
      <div className="space-y-1.5">
        {items.slice(0, 8).map((item, i) => {
          const title = getPresetField(item, displayConfig, 'title');
          const subtitle = getPresetField(item, displayConfig, 'subtitle');
          const price = getPresetField(item, displayConfig, 'price');
          const badge = getPresetField(item, displayConfig, 'badge');
          return (
            <div key={item.id ?? i} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
              <span className="text-[10px] font-bold text-muted-foreground bg-muted rounded w-5 h-5 flex items-center justify-center shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                {title && <h4 className="text-xs font-semibold truncate">{String(title.value)}</h4>}
                {subtitle && <p className="text-[10px] text-muted-foreground truncate">{String(subtitle.value)}</p>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {badge && <span className="text-[9px] font-medium px-1 py-0.5 rounded-full bg-primary/10 text-primary">{formatPresetValue(badge.value, badge.field)}</span>}
                {price && <span className="text-xs font-bold">{formatPresetValue(price.value, price.field)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // comparison_table or unknown — render as simple table
  if (preset === 'comparison_table' && items.length > 0) {
    const fields = displayConfig.fields.filter((f) => f.priority !== 'secondary');
    return (
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Field</th>
                {items.slice(0, 4).map((item, i) => {
                  const title = getPresetField(item, displayConfig, 'title');
                  return <th key={item.id ?? i} className="text-left px-2 py-1.5 text-[10px] font-semibold">{title ? String(title.value) : `Item ${i + 1}`}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {fields.filter((f) => f.role !== 'title').map((field) => (
                <tr key={field.source} className="border-b border-border/50 last:border-0">
                  <td className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground">{field.label ?? field.role}</td>
                  {items.slice(0, 4).map((item, i) => {
                    const val = item.fields[field.source];
                    return <td key={item.id ?? i} className="px-2 py-1.5">{val != null ? formatPresetValue(val, field) : <span className="text-muted-foreground/40">—</span>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return null;
}

// ============================================================================
// MESSAGE BUBBLE
// ============================================================================

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
        <Bot className="size-4 text-primary" />
      </div>
      <div className="flex-1 space-y-2 max-w-[85%]">
        {message.toolCalls.length > 0 && (
          <div className="space-y-1.5">
            {message.toolCalls.map((tc) => (
              <ToolCallChip key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
        {message.classification && (
          <ClassificationBadge classification={message.classification} shortCircuited={message.shortCircuited} />
        )}
        {message.content && (
          <div className="rounded-2xl rounded-tl-sm bg-muted/50 border border-border/40 px-4 py-2.5 text-sm whitespace-pre-wrap">
            {message.content}
          </div>
        )}
        {message.presetData && message.presetData.items.length > 0 && (
          <ChatPresetRenderer data={message.presetData} />
        )}
        {!message.content && (
          <div className="rounded-2xl rounded-tl-sm bg-muted/50 border border-border/40 px-3 py-2 flex items-center gap-2.5">
            <Loader2 className="size-3.5 animate-spin text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">
              {message.pipelineStep ?? 'Processing…'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface ChatTestPanelProps {
  experienceSlug: string;
  experienceName: string;
}

export function ChatTestPanel({ experienceSlug, experienceName }: ChatTestPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const currentAssistantIdRef = useRef<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Buffer preset data until text content starts streaming (so grid + text appear together)
  const pendingPresetRef = useRef<PresetData | null>(null);

  function isNearBottom() {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  function scrollToBottom(force = false) {
    // Defer until after React has flushed the DOM update
    requestAnimationFrame(() => {
      const el = scrollContainerRef.current;
      if (!el) return;
      if (force || isNearBottom()) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }

  function clearChat() {
    setMessages([]);
    setSessionId(null);
    setErrorMsg(null);
    pendingPresetRef.current = null;
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || isStreaming) return;

    setIsExpanded(true);
    setInput('');
    setErrorMsg(null);

    const userMsg: UserMessage = {
      role: 'user',
      id: crypto.randomUUID(),
      content: text,
    };

    const assistantMsgId = crypto.randomUUID();
    currentAssistantIdRef.current = assistantMsgId;
    const assistantMsg: AssistantMessage = {
      role: 'assistant',
      id: assistantMsgId,
      content: '',
      toolCalls: [],
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    scrollToBottom(true);

    const sid = sessionId ?? crypto.randomUUID();
    if (!sessionId) setSessionId(sid);

    try {
      const response = await fetch(
        `/api/v1/ai-experiences/${experienceSlug}/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, sessionId: sid }),
        },
      );

      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error ?? `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: SSEEvent;
          try {
            event = JSON.parse(raw) as SSEEvent;
          } catch {
            continue;
          }

          if (event.type === 'step_start') {
            // Pipeline phase started — show label next to spinner
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId && m.role === 'assistant'
                  ? { ...m, pipelineStep: event.stepName }
                  : m,
              ),
            );
            scrollToBottom();
          } else if (event.type === 'step_complete') {
            // Phase done — clear label (next step_start will set a new one)
          } else if (event.type === 'content' && (event.text || event.content)) {
            const chunk = event.text ?? event.content ?? '';
            // Flush buffered preset data together with the first content chunk
            const flushedPreset = pendingPresetRef.current;
            pendingPresetRef.current = null;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId && m.role === 'assistant'
                  ? { ...m, content: m.content + chunk, pipelineStep: undefined, ...(flushedPreset && !m.presetData ? { presetData: flushedPreset } : {}) }
                  : m,
              ),
            );
            scrollToBottom();
          } else if (event.type === 'tool_call') {
            const callId = event.id ?? '';
            const callName = event.name ?? '';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId && m.role === 'assistant'
                  ? {
                      ...m,
                      toolCalls: [
                        ...m.toolCalls,
                        {
                          id: callId,
                          name: callName,
                          displayName: event.displayName ?? callName,
                          input: event.arguments ?? event.input ?? {},
                          done: false,
                        },
                      ],
                    }
                  : m,
              ),
            );
            scrollToBottom();
          } else if (event.type === 'tool_result') {
            const resultId = event.id ?? '';
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantMsgId || m.role !== 'assistant') return m;
                return {
                  ...m,
                  toolCalls: m.toolCalls.map((tc) =>
                    tc.id === resultId
                      ? { ...tc, done: true, success: event.success, durationMs: event.durationMs }
                      : tc,
                  ),
                };
              }),
            );
            scrollToBottom();
          } else if (event.type === 'classification') {
            // Store classification on assistant message for badge display
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId && m.role === 'assistant'
                  ? { ...m, classification: event.classification, shortCircuited: event.debug?.shortCircuited === true }
                  : m,
              ),
            );
          } else if (event.type === 'preset' && event.preset && event.data) {
            // Buffer preset data — will be flushed when first content chunk arrives
            const payload = event.data as { items?: Array<{ id?: string; fields: Record<string, unknown> }>; displayConfig?: PresetData['displayConfig'] };
            if (payload.items && payload.displayConfig) {
              pendingPresetRef.current = { preset: event.preset!, items: payload.items!, displayConfig: payload.displayConfig! };
            }
          } else if (event.type === 'done') {
            if (event.sessionId) setSessionId(event.sessionId);
            // Flush any buffered preset that wasn't attached during content streaming
            const remainingPreset = pendingPresetRef.current;
            pendingPresetRef.current = null;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId && m.role === 'assistant'
                  ? { ...m, pipelineStep: undefined, ...(remainingPreset && !m.presetData ? { presetData: remainingPreset } : {}) }
                  : m,
              ),
            );
            scrollToBottom(true);
          } else if (event.type === 'error') {
            setErrorMsg(event.message ?? 'An error occurred');
            scrollToBottom(true);
          }
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send message');
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
    } finally {
      setIsStreaming(false);
      currentAssistantIdRef.current = null;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  const turnCount = messages.filter((m) => m.role === 'user').length;

  // ── COLLAPSED ──────────────────────────────────────────────────────────────
  if (!isExpanded) {
    return (
      <div
        className="relative cursor-pointer group"
        onClick={() => setIsExpanded(true)}
      >
        {/* Animated glow ring behind the card */}
        <div className="absolute -inset-px rounded-2xl bg-linear-to-r from-violet-500/40 via-primary/30 to-indigo-500/40 blur-sm animate-pulse opacity-60" />

        {/* Card */}
        <div className="relative flex items-center gap-4 rounded-2xl border border-primary/20 bg-card px-5 py-4 transition-all group-hover:border-primary/40 shadow-sm">
          {/* Icon with subtle inner glow */}
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/25 group-hover:bg-primary/15 transition-colors">
            <Bot className="size-5 text-primary" />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Test Chat</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/15 border border-violet-500/30 text-violet-600 dark:text-violet-400 text-[11px] px-2 py-0.5 font-semibold">
                <Sparkles className="size-2.5" />
                Live
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {turnCount > 0
                ? `${turnCount} turn${turnCount !== 1 ? 's' : ''} — click to continue conversation`
                : `Chat with ${experienceName} and see tool calls in real time`}
            </p>
          </div>

          {/* Right side CTA */}
          <div className="flex items-center gap-2 shrink-0">
            {turnCount > 0 && (
              <Badge variant="outline" className="rounded-lg text-xs tabular-nums">
                {turnCount} turn{turnCount !== 1 ? 's' : ''}
              </Badge>
            )}
            <div className="flex items-center gap-1 rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary group-hover:bg-primary/15 transition-colors">
              <MessageSquare className="size-3" />
              Open
              <ChevronDown className="size-3 ml-0.5" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── EXPANDED ───────────────────────────────────────────────────────────────
  return (
    <Card className="border-border/60 shadow-sm rounded-2xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            Test Chat
            <span className="text-muted-foreground font-normal text-sm">— {experienceName}</span>
          </CardTitle>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-lg text-xs text-muted-foreground hover:text-foreground"
                onClick={clearChat}
                disabled={isStreaming}
              >
                <Trash2 className="size-3.5 mr-1.5" />
                Clear
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => setIsExpanded(false)}
              title="Collapse"
              disabled={isStreaming}
            >
              <ChevronUp className="size-3.5" />
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          Tool calls will be shown inline as the AI reasons through your query.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Message List */}
        <div ref={scrollContainerRef} className="min-h-[200px] max-h-[480px] overflow-y-auto space-y-4 pr-1">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground gap-2">
              <Bot className="size-8 opacity-30" />
              <p className="text-sm">Send a message to start chatting</p>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
            {errorMsg}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
            rows={2}
            className="rounded-xl resize-none flex-1 text-sm"
          />
          <Button
            className="rounded-xl h-[60px] px-4 shrink-0"
            onClick={() => void sendMessage()}
            disabled={isStreaming || !input.trim()}
          >
            {isStreaming ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>

        {sessionId && (
          <p className="text-[10px] text-muted-foreground font-mono truncate">
            Session: {sessionId}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
