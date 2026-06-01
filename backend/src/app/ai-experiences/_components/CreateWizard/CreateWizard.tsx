'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bot,
  GitBranch,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  CheckCircle2,
  XCircle,
  Plus,
  X,
  GripVertical,
  Search,
  Sparkles,
  RotateCcw,
 Cpu, Wrench } from 'lucide-react';
import { ToolTypeChip } from '@/app/tools/_components/ToolTypeChip';
import { useAllActiveTools } from '@/app/tools/_lib/hooks/useTools';
import { useCreateAIExperience, useAIExperienceSlugAvailability } from '../../_lib/hooks/useAIExperiences';
import type { PipelineMode } from '../../_lib/api-client';
import { useMcpConnections } from '@/app/mcp-connections/_lib/hooks/useMcpConnections';
import { mcpConnectionsApi } from '@/app/mcp-connections/_lib/api-client';
import Link from 'next/link';

// ============================================================================
// TYPES
// ============================================================================

type Tone = 'professional' | 'friendly' | 'casual' | 'enthusiastic' | 'concise';

interface ToolInfo {
  id: string;
  name: string;
  slug: string;
  executorType: string;
  operation: string | null;
  description: string | null;
  aiDescription?: string;
}

interface WizardData {
  name: string;
  slug: string;
  description: string;
  pipelineMode: PipelineMode;
  aiConfig: Record<string, unknown>;
  tone: Tone;
  allowedOrigins: string[];
  rateLimitChatPerMinute: number;
  rateLimitRequestsPerDay: string;
  selectedToolIds: string[];
  selectedMcpConnectionIds: string[];
}

const TONE_OPTIONS: { value: Tone; label: string; description: string }[] = [
  { value: 'professional', label: 'Professional', description: 'Formal, authoritative tone' },
  { value: 'friendly', label: 'Friendly', description: 'Warm and approachable' },
  { value: 'casual', label: 'Casual', description: 'Relaxed and conversational' },
  { value: 'enthusiastic', label: 'Enthusiastic', description: 'Energetic and upbeat' },
  { value: 'concise', label: 'Concise', description: 'Short and to the point' },
];

const STEPS = [
  { label: 'Basics', description: 'Name & mode' },
  { label: 'Tools', description: 'Assign capabilities' },
  { label: 'AI Config', description: 'Model & instructions' },
  { label: 'Access', description: 'Rate limits & CORS' },
];

// ============================================================================
// PROMPT GENERATION
// ============================================================================

const TONE_INSTRUCTIONS: Record<string, string> = {
  professional: 'Maintain a professional, clear, and authoritative tone.',
  friendly: 'Be warm, approachable, and conversational.',
  casual: 'Keep your tone relaxed and informal.',
  enthusiastic: 'Be upbeat, energetic, and encouraging.',
  concise: 'Be brief and to the point. Avoid unnecessary detail.',
};

/**
 * Generate a default system instruction from experience context.
 * This is the user-editable "layer 1" — backend adds tone, tool awareness, etc. automatically.
 */
function generateSystemInstructions(
  experienceName: string,
  experienceDescription: string,
  tools: ToolInfo[],
): string {
  const parts: string[] = [];

  // Identity
  if (experienceName) {
    parts.push(`You are the AI assistant for "${experienceName}".`);
  } else {
    parts.push('You are a helpful AI assistant.');
  }

  // Domain context from description
  if (experienceDescription.trim()) {
    parts.push(experienceDescription.trim());
  }

  // Tool-aware guidance
  if (tools.length > 0) {
    const hasSearch = tools.some((t) => t.operation === 'search');
    const hasLookup = tools.some((t) => t.operation === 'lookup');
    const hasInspect = tools.some((t) => t.operation === 'inspect');
    const hasEnumerate = tools.some((t) => t.operation === 'enumerate');

    const capabilities: string[] = [];
    if (hasSearch) capabilities.push('search for relevant results');
    if (hasLookup) capabilities.push('look up specific items by ID');
    if (hasInspect) capabilities.push('inspect available data fields');
    if (hasEnumerate) capabilities.push('discover available filter values');

    if (capabilities.length > 0) {
      parts.push(`When users ask questions, use your tools to ${capabilities.join(', ')}. Always present real data from tool results — never make up information.`);
    }

    if (hasSearch && hasEnumerate) {
      parts.push('If the user\'s request is vague, ask a clarifying question. Use the enumerate tool to discover valid filter values before applying filters.');
    } else if (hasSearch) {
      parts.push('If the user\'s request is vague, ask a clarifying question about what they\'re looking for before searching.');
    }
  }

  return parts.join(' ');
}

/**
 * Build a full prompt preview — mirrors backend buildSystemPrompt logic.
 */
function buildPromptPreview(
  systemInstructions: string,
  tone: Tone,
  tools: ToolInfo[],
): string {
  const parts: string[] = [];

  // 1. Core identity (user-editable)
  parts.push(systemInstructions.trim() || 'You are a helpful AI assistant.');

  // 2. Tone (auto-added by backend)
  if (TONE_INSTRUCTIONS[tone]) {
    parts.push(TONE_INSTRUCTIONS[tone]);
  }

  // 3. Tool awareness (auto-added by backend)
  if (tools.length > 0) {
    const toolLines = tools.map((t) => {
      const desc = t.aiDescription || t.description || t.name;
      return `- **${t.name}**: ${desc}`;
    });
    parts.push(
      'You have access to the following tools:\n' +
      toolLines.join('\n') + '\n\n' +
      'Use these tools to answer the user\'s questions with real data. ' +
      'Never fabricate information that a tool could provide — call the tool instead. ' +
      'If the user\'s request is vague, ask a clarifying question before searching.',
    );
  }

  return parts.join('\n\n');
}

// ============================================================================
// STEP INDICATOR
// ============================================================================

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => {
        const idx = i + 1;
        const done = idx < current;
        const active = idx === current;
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div className={`flex size-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                done ? 'bg-emerald-500 text-white'
                : active ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                : 'bg-muted text-muted-foreground'
              }`}>
                {done ? <Check className="size-4" /> : idx}
              </div>
              <div className="text-center hidden sm:block">
                <p className={`text-[11px] font-semibold leading-tight ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{step.label}</p>
                <p className="text-[10px] text-muted-foreground">{step.description}</p>
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-8 sm:w-12 rounded-full ${idx < current ? 'bg-emerald-500' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// STEP 1: BASICS
// ============================================================================

function Step1({ data, onChange, errors }: {
  data: WizardData;
  onChange: (d: Partial<WizardData>) => void;
  errors: Record<string, string>;
}) {
  const { isAvailable, isChecking, isDebouncing } = useAIExperienceSlugAvailability(
    data.slug,
    undefined,
    data.slug.length >= 3
  );

  function handleNameChange(name: string) {
    const slug = name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 100);
    onChange({ name, slug });
  }

  const slugStatus = data.slug.length < 3 ? null : isChecking || isDebouncing ? 'checking' : isAvailable ? 'available' : 'taken';

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="exp-name">Name <span className="text-destructive">*</span></Label>
        <Input id="exp-name" value={data.name} onChange={(e) => handleNameChange(e.target.value)}
          placeholder="e.g. Fashion Product Assistant" className={`rounded-xl ${errors.name ? 'border-destructive' : ''}`} autoFocus />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="exp-slug">Unique ID <span className="text-destructive">*</span></Label>
        <div className="relative">
          <Input id="exp-slug" value={data.slug}
            onChange={(e) => onChange({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
            placeholder="fashion-product-assistant" className={`rounded-xl font-mono pr-8 ${slugStatus === 'taken' || errors.slug ? 'border-destructive' : slugStatus === 'available' ? 'border-emerald-500' : ''}`} />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {slugStatus === 'checking' && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            {slugStatus === 'available' && <CheckCircle2 className="size-4 text-emerald-500" />}
            {slugStatus === 'taken' && <XCircle className="size-4 text-destructive" />}
          </div>
        </div>
        {errors.slug ? (
          <p className="text-xs text-destructive">{errors.slug}</p>
        ) : slugStatus === 'taken' ? (
          <p className="text-xs text-destructive">This ID is already taken.</p>
        ) : (
          <p className="text-xs text-muted-foreground">Used in API calls. Auto-generated from name.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="exp-desc">Description</Label>
        <Textarea id="exp-desc" value={data.description} onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Help customers find fashion products, compare prices, and discover new styles."
          rows={2} className="rounded-xl resize-none" />
        <p className="text-xs text-muted-foreground">Describe what this experience does — this helps generate better AI instructions.</p>
      </div>

      {/* Pipeline Mode */}
      <div className="space-y-2">
        <Label>Pipeline Mode <span className="text-destructive">*</span></Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([
            { mode: 'agentic' as PipelineMode, icon: Bot, iconBg: 'bg-violet-500/10', iconClass: 'text-violet-500', label: 'Agentic', desc: 'AI decides which tools to use and when, based on the conversation.' },
            { mode: 'deterministic' as PipelineMode, icon: GitBranch, iconBg: 'bg-blue-500/10', iconClass: 'text-blue-500', label: 'Deterministic', desc: 'Fixed tool execution order. Predictable, fast, and reliable.' },
          ] as const).map(({ mode, icon: Icon, iconBg, iconClass, label, desc }) => {
            const selected = data.pipelineMode === mode;
            return (
              <button key={mode} type="button" onClick={() => onChange({ pipelineMode: mode })}
                className={`flex items-start gap-3.5 rounded-xl border p-4 text-left transition-all ${selected ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border/60 bg-card hover:border-border hover:bg-muted/30'}`}>
                <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
                  <Icon className={`size-5 ${iconClass}`} />
                </div>
                <div>
                  <p className={`font-semibold text-sm ${selected ? 'text-primary' : ''}`}>{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STEP 2: TOOLS (moved up from step 3)
// ============================================================================

function Step2_Tools({ data, onChange, allTools }: {
  data: WizardData;
  onChange: (d: Partial<WizardData>) => void;
  allTools: ToolInfo[];
}) {
  const isLoading = allTools.length === 0;
  const [search, setSearch] = useState('');
  const { connections: mcpConnections, isLoading: mcpLoading } = useMcpConnections({ pageSize: 100, isActive: true });

  const filtered = allTools.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.executorType.toLowerCase().includes(search.toLowerCase())
  );

  function toggleTool(id: string) {
    const selected = data.selectedToolIds;
    if (selected.includes(id)) {
      onChange({ selectedToolIds: selected.filter((tid) => tid !== id) });
    } else {
      onChange({ selectedToolIds: [...selected, id] });
    }
  }

  function toggleMcp(id: string) {
    const selected = data.selectedMcpConnectionIds;
    if (selected.includes(id)) {
      onChange({ selectedMcpConnectionIds: selected.filter((cid) => cid !== id) });
    } else {
      onChange({ selectedMcpConnectionIds: [...selected, id] });
    }
  }

  const selectedTools = allTools.filter((t) => data.selectedToolIds.includes(t.id));
  const selectedMcps = mcpConnections.filter((c) => data.selectedMcpConnectionIds.includes(c.id));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium">Select the tools this experience can use</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          The AI will use these to answer user questions. You can also add more later.
        </p>
      </div>

      {/* ─── Tools section ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-orange-500" />
          <h3 className="text-sm font-semibold">Tools</h3>
          {selectedTools.length > 0 && (
            <Badge variant="secondary" className="rounded-md text-xs">{selectedTools.length} selected</Badge>
          )}
        </div>

        {selectedTools.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedTools.map((t) => (
              <Badge key={t.id} variant="secondary" className="rounded-lg px-2.5 py-1 gap-1.5">
                <GripVertical className="size-3 text-muted-foreground/50" />
                {t.name}
                <button type="button" onClick={() => toggleTool(t.id)} className="hover:text-destructive">
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="Search tools..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 rounded-xl" />
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">No tools found.</p>
          ) : (
            filtered.map((tool) => {
              const isSelected = data.selectedToolIds.includes(tool.id);
              return (
                <button key={tool.id} type="button" onClick={() => toggleTool(tool.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${isSelected ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-muted/20 hover:bg-muted/40'}`}>
                  <div className={`size-4 shrink-0 rounded flex items-center justify-center border transition-colors ${isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                    {isSelected && <Check className="size-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{tool.name}</p>
                      <ToolTypeChip executorType={tool.executorType} operation={tool.operation} size="sm" />
                    </div>
                    {tool.description && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{tool.description}</p>}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* ─── MCP Connections section ────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="size-4 text-indigo-500" />
          <h3 className="text-sm font-semibold">MCP Connections</h3>
          {selectedMcps.length > 0 && (
            <Badge variant="secondary" className="rounded-md text-xs">{selectedMcps.length} attached</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          Attach a Model Context Protocol server to expose all of its tools to this experience. You can restrict which tools per-experience after creating.
        </p>

        {mcpLoading ? (
          <div className="flex items-center justify-center py-6"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : mcpConnections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 p-5 text-center text-sm">
            <Cpu className="size-7 mx-auto mb-2 text-muted-foreground/60" />
            <p className="text-muted-foreground">No MCP connections yet.</p>
            <Link href="/mcp-connections/create" target="_blank" className="text-xs text-primary underline mt-2 inline-block">
              Create one (opens in new tab)
            </Link>
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {mcpConnections.map((conn) => {
              const isSelected = data.selectedMcpConnectionIds.includes(conn.id);
              const toolCount = conn.discoveredTools?.tools.length ?? 0;
              return (
                <button key={conn.id} type="button" onClick={() => toggleMcp(conn.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${isSelected ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-border/60 bg-muted/20 hover:bg-muted/40'}`}>
                  <div className={`size-4 shrink-0 rounded flex items-center justify-center border transition-colors ${isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-border'}`}>
                    {isSelected && <Check className="size-3" />}
                  </div>
                  <Cpu className="size-4 text-indigo-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{conn.name}</p>
                      <Badge variant="outline" className="rounded-md text-[10px] font-mono">{conn.transport}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{conn.serverUrl}</p>
                  </div>
                  <Badge variant="outline" className="rounded-lg shrink-0">
                    <Wrench className="size-3 mr-1" />
                    {toolCount}
                  </Badge>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ============================================================================
// STEP 3: AI CONFIG (moved from step 2, now with auto-generation)
// ============================================================================

interface AIProvider {
  id: string;
  key: string;
  name: string;
  models: Array<{ id: number; key: string; name: string; type: string }>;
}

interface ResolvedDefaults {
  chat: { providerId: string | null; providerKey: string | null; modelId: number | null; modelKey: string | null };
}

function Step3_AIConfig({ data, onChange, selectedTools, onGeneratePrompt }: {
  data: WizardData;
  onChange: (d: Partial<WizardData>) => void;
  selectedTools: ToolInfo[];
  onGeneratePrompt: () => void;
}) {
  const ai = data.aiConfig;
  function setAi(key: string, val: unknown) {
    onChange({ aiConfig: { ...ai, [key]: val } });
  }

  const { data: providersData, isLoading: isLoadingProviders } = useQuery({
    queryKey: ['ai-providers-for-experience'],
    queryFn: async () => {
      const res = await fetch('/api/ai-service/providers');
      const json = await res.json() as { data?: { providers: AIProvider[] }; providers?: AIProvider[] };
      return (json.data || json) as { providers: AIProvider[] };
    },
  });

  const { data: resolvedData } = useQuery({
    queryKey: ['system-defaults-ai-resolved'],
    queryFn: async () => {
      const res = await fetch('/api/system-defaults/ai/resolved');
      const json = await res.json() as { data?: ResolvedDefaults } & ResolvedDefaults;
      return (json.data || json) as ResolvedDefaults;
    },
  });

  const providers = providersData?.providers ?? [];
  const selectedProviderId = (ai.providerId as string | null | undefined) ?? null;
  const selectedModelId = (ai.modelId as number | null | undefined) ?? null;
  const selectedProvider = providers.find((p) => p.id === selectedProviderId);
  const chatModels = selectedProvider?.models.filter((m) => m.type === 'chat') ?? [];
  const defaultChat = resolvedData?.chat;

  const systemInstructions = (ai.systemInstructions as string) ?? '';
  const isGenerating = (ai._isGenerating as boolean) ?? false;

  function handleProviderChange(value: string) {
    if (value === '__default__') {
      onChange({ aiConfig: { ...ai, providerId: null, modelId: null } });
    } else {
      const provider = providers.find((p) => p.id === value);
      const firstChatModel = provider?.models.find((m) => m.type === 'chat');
      onChange({ aiConfig: { ...ai, providerId: value, modelId: firstChatModel?.id ?? null } });
    }
  }

  // Build the full preview
  const fullPreview = buildPromptPreview(systemInstructions, data.tone, selectedTools);

  return (
    <div className="space-y-5">
      {/* Provider / Model */}
      <div className="space-y-2">
        <div>
          <Label>AI Provider &amp; Model</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select a specific provider and model, or leave as system default.
          </p>
        </div>
        {isLoadingProviders ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="h-10 bg-muted rounded-xl animate-pulse" />
            <div className="h-10 bg-muted rounded-xl animate-pulse" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Select value={selectedProviderId ?? '__default__'} onValueChange={handleProviderChange}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="System Default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">System Default</SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedModelId != null ? String(selectedModelId) : '__default__'}
              onValueChange={(v) => setAi('modelId', v === '__default__' ? null : Number(v))}
              disabled={!selectedProvider}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder={!selectedProvider ? 'System Default' : 'Select model'} />
              </SelectTrigger>
              <SelectContent>
                {!selectedProvider && <SelectItem value="__default__">System Default</SelectItem>}
                {chatModels.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {!selectedProviderId && defaultChat?.providerKey && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500 shrink-0" />
            System default: <span className="font-mono">{defaultChat.providerKey}</span>
            {defaultChat.modelKey && <> / <span className="font-mono">{defaultChat.modelKey}</span></>}
          </p>
        )}
      </div>

      {/* Tone */}
      <div className="space-y-2">
        <Label>Tone</Label>
        <Select value={data.tone} onValueChange={(v) => onChange({ tone: v as Tone })}>
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {TONE_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value} className="rounded-lg">
                <span className="font-medium">{t.label}</span>
                <span className="text-muted-foreground ml-2 text-xs">{t.description}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* System Instructions */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>System Instructions</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={onGeneratePrompt}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <><Loader2 className="size-3 animate-spin" /> Generating...</>
            ) : (
              <><RotateCcw className="size-3" /> Regenerate</>
            )}
          </Button>
        </div>

        {isGenerating ? (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Sparkles className="size-4 animate-pulse" />
              Composing instructions...
            </div>
            <div className="space-y-2">
              <div className="h-3 bg-primary/10 rounded animate-pulse w-full" />
              <div className="h-3 bg-primary/10 rounded animate-pulse w-4/5" />
              <div className="h-3 bg-primary/10 rounded animate-pulse w-3/5" />
            </div>
          </div>
        ) : (
          <Textarea value={systemInstructions}
            onChange={(e) => setAi('systemInstructions', e.target.value || null)}
            placeholder="Describe how the AI should behave..."
            rows={5} className="rounded-xl resize-none" />
        )}
        <p className="text-xs text-muted-foreground">
          Your custom instructions for the AI. Tone, tool descriptions, and guardrails are added automatically.
        </p>
      </div>

      {/* Context Messages */}
      <div className="space-y-1.5">
        <Label>Conversation Memory</Label>
        <Input type="number" min={1} max={50}
          value={(ai.maxContextMessages as number) ?? 20}
          onChange={(e) => setAi('maxContextMessages', Number(e.target.value) || 20)}
          className="rounded-xl" />
        <p className="text-xs text-muted-foreground">How many recent messages the AI remembers (1–50).</p>
      </div>

      {/* Full Prompt Preview — always visible */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Final prompt preview
          </p>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 rounded">auto-composed</Badge>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 max-h-64 overflow-y-auto">
          <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono leading-relaxed">
            {fullPreview}
          </pre>
        </div>
        <p className="text-xs text-muted-foreground">
          This is what the AI receives. Your instructions are combined with tone, tool awareness, and format guidance at runtime.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// STEP 4: ACCESS CONTROL
// ============================================================================

function Step4({ data, onChange }: { data: WizardData; onChange: (d: Partial<WizardData>) => void }) {
  const [originInput, setOriginInput] = useState('');

  function addOrigin() {
    const origin = originInput.trim();
    if (!origin) return;
    onChange({ allowedOrigins: [...data.allowedOrigins, origin] });
    setOriginInput('');
  }

  function removeOrigin(origin: string) {
    onChange({ allowedOrigins: data.allowedOrigins.filter((o) => o !== origin) });
  }

  return (
    <div className="space-y-6">
      {/* Allowed Origins */}
      <div className="space-y-2">
        <Label>Allowed Origins</Label>
        <p className="text-xs text-muted-foreground">
          Restrict API calls to specific origins. Leave empty to allow all origins.
        </p>
        <div className="flex gap-2">
          <Input value={originInput} onChange={(e) => setOriginInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addOrigin())}
            placeholder="https://your-site.com" className="rounded-xl flex-1 font-mono text-sm" />
          <Button type="button" variant="outline" className="rounded-xl gap-1" onClick={addOrigin}>
            <Plus className="size-4" /> Add
          </Button>
        </div>
        {data.allowedOrigins.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {data.allowedOrigins.map((origin) => (
              <Badge key={origin} variant="secondary" className="rounded-lg px-2.5 py-1 text-xs gap-1.5 font-mono">
                {origin}
                <button type="button" onClick={() => removeOrigin(origin)} className="hover:text-destructive">
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Rate Limits */}
      <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-4">
        <p className="text-sm font-semibold">Rate Limits</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Chats per Minute</Label>
            <Input type="number" min={1} max={1000} value={data.rateLimitChatPerMinute}
              onChange={(e) => onChange({ rateLimitChatPerMinute: Number(e.target.value) || 60 })}
              className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Requests per Day</Label>
            <Input type="number" min={1} value={data.rateLimitRequestsPerDay}
              onChange={(e) => onChange({ rateLimitRequestsPerDay: e.target.value })}
              placeholder="Unlimited" className="rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// WIZARD ORCHESTRATOR
// ============================================================================

export function CreateWizard({ basePath = '/ai-experiences' }: { basePath?: string } = {}) {
  const router = useRouter();
  const { createExperience, isCreating } = useCreateAIExperience();
  const { data: allTools = [] } = useAllActiveTools();
  const isRedirecting = useRef(false);
  const hasAutoGenerated = useRef(false);

  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({
    name: '',
    slug: '',
    description: '',
    pipelineMode: 'agentic',
    aiConfig: { providerId: null, modelId: null, maxContextMessages: 20 },
    tone: 'professional',
    allowedOrigins: [],
    rateLimitChatPerMinute: 60,
    rateLimitRequestsPerDay: '',
    selectedToolIds: [],
    selectedMcpConnectionIds: [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectedTools = allTools.filter((t) => data.selectedToolIds.includes(t.id));

  function update(partial: Partial<WizardData>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  function validateStep(s: number): boolean {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!data.name.trim()) e.name = 'Name is required';
      if (!data.slug.trim()) e.slug = 'Slug is required';
      else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) e.slug = 'Slug must be lowercase letters, numbers, and hyphens only';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  /**
   * Generate (or regenerate) system instructions with a visual animation.
   */
  const runPromptGeneration = useCallback(() => {
    setData((prev) => ({
      ...prev,
      aiConfig: { ...prev.aiConfig, _isGenerating: true },
    }));

    // Brief delay for the composing animation to feel intentional
    setTimeout(() => {
      const tools = allTools.filter((t) => data.selectedToolIds.includes(t.id));
      const generated = generateSystemInstructions(data.name, data.description, tools);
      setData((prev) => ({
        ...prev,
        aiConfig: {
          ...prev.aiConfig,
          systemInstructions: generated,
          _isGenerating: false,
        },
      }));
    }, 800);
  }, [allTools, data.selectedToolIds, data.name, data.description]);

  function handleNext() {
    if (!validateStep(step)) return;

    // When entering Step 3 (AI Config), auto-generate prompt if not done yet
    if (step === 2 && !hasAutoGenerated.current) {
      hasAutoGenerated.current = true;
      // Set generating state before moving to next step
      setData((prev) => ({
        ...prev,
        aiConfig: { ...prev.aiConfig, _isGenerating: true },
      }));
      setStep(3);
      // Generate after a brief delay
      setTimeout(() => {
        const tools = allTools.filter((t) => data.selectedToolIds.includes(t.id));
        const generated = generateSystemInstructions(data.name, data.description, tools);
        setData((prev) => ({
          ...prev,
          aiConfig: {
            ...prev.aiConfig,
            systemInstructions: generated,
            _isGenerating: false,
          },
        }));
      }, 1000);
    } else {
      setStep((s) => s + 1);
    }
  }

  async function handleCreate() {
    if (!validateStep(step) || isRedirecting.current) return;
    setSubmitError(null);
    try {
      const ai = data.aiConfig as Record<string, unknown>;
      const exp = await createExperience({
        name: data.name,
        slug: data.slug,
        description: data.description || undefined,
        pipelineMode: data.pipelineMode,
        personaConfig: {
          systemInstructions: (ai?.systemInstructions as string) || 'You are a helpful AI assistant.',
          tone: data.tone,
          responseFormats: {
            enabledPresets: ['rich_text'],
            defaultPreset: 'rich_text',
            enableCitations: false,
            citationStyle: 'none',
          },
        },
        sessionConfig: {
          maxContextMessages: (ai?.maxContextMessages as number) ?? 20,
        },
        accessConfig: {
          allowedOrigins: data.allowedOrigins,
          rateLimits: {
            chatPerMinute: data.rateLimitChatPerMinute,
            requestsPerDay: data.rateLimitRequestsPerDay ? Number(data.rateLimitRequestsPerDay) : 10000,
          },
        },
        observabilityConfig: {},
        providerId: (ai?.providerId as string) ?? undefined,
        modelId: (ai?.modelId as number) ?? undefined,
        toolIds: data.selectedToolIds,
      });

      // Attach any selected MCP connections (best-effort; failure logs but
      // does not roll back the experience creation).
      if (data.selectedMcpConnectionIds.length > 0) {
        const attachResults = await Promise.allSettled(
          data.selectedMcpConnectionIds.map((cid) =>
            mcpConnectionsApi.attach(exp.id, { mcpConnectionId: cid, enabledToolNames: null }),
          ),
        );
        const failed = attachResults.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
           
          console.warn(`Failed to attach ${failed} MCP connection(s) to experience ${exp.id}`);
        }
      }

      isRedirecting.current = true;
      router.push(`${basePath}/${exp.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create experience');
    }
  }

  const stepDescriptions: Record<number, string> = {
    1: 'Give your experience a name and choose how it works.',
    2: 'Choose the tools this experience can use to answer questions.',
    3: 'Configure the AI model and review the generated instructions.',
    4: 'Set up rate limits and allowed origins for the API.',
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-center">
        <StepIndicator current={step} />
      </div>

      <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="p-6 border-b border-border/60">
          <h2 className="text-base font-semibold">{STEPS[step - 1].label}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{stepDescriptions[step]}</p>
        </div>
        <div className="p-6">
          {step === 1 && <Step1 data={data} onChange={update} errors={errors} />}
          {step === 2 && <Step2_Tools data={data} onChange={update} allTools={allTools} />}
          {step === 3 && <Step3_AIConfig data={data} onChange={update} selectedTools={selectedTools} onGeneratePrompt={runPromptGeneration} />}
          {step === 4 && <Step4 data={data} onChange={update} />}
        </div>
        <div className="px-6 pb-6 flex items-center justify-between">
          <Button variant="outline" className="rounded-xl" onClick={() => { setErrors({}); setStep((s) => s - 1); }} disabled={step === 1 || isCreating}>
            <ChevronLeft className="size-4 mr-1" />Back
          </Button>
          <div className="flex items-center gap-3">
            {submitError && <p className="text-sm text-destructive">{submitError}</p>}
            {step < 4 ? (
              <Button className="rounded-xl" onClick={handleNext}>
                Next<ChevronRight className="size-4 ml-1" />
              </Button>
            ) : (
              <Button className="rounded-xl" onClick={handleCreate} disabled={isCreating}>
                {isCreating ? <><Loader2 className="size-4 mr-2 animate-spin" />Creating...</> : 'Create Experience'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
