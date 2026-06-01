'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ChevronDown, Loader2, Save, Bot, Plus, X, Eye } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { PipelineModeChip, PIPELINE_MODE_CONFIG } from './PipelineModeChip';
import { useAIExperience } from '../_lib/hooks/useAIExperiences';
import type { PipelineMode } from '../_lib/api-client';

interface AIExperienceEditProps {
  id: string;
  basePath?: string;
  listPath?: string;
}

export function AIExperienceEdit({ id, basePath = '/ai-experiences', listPath }: AIExperienceEditProps) {
  const listHref = listPath ?? basePath;
  const router = useRouter();
  const { experience, isLoading, updateExperience, isUpdating } = useAIExperience(id);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>('deterministic');
  const [persona, setPersona] = useState('');
  const [tone, setTone] = useState<'professional' | 'friendly' | 'casual' | 'enthusiastic' | 'concise'>('professional');
  const [providerId, setProviderId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<number | null>(null);
  const [maxContextMessages, setMaxContextMessages] = useState(20);
  const [allowedOrigins, setAllowedOrigins] = useState<string[]>([]);
  const [originInput, setOriginInput] = useState('');
  const [rateLimitCPM, setRateLimitCPM] = useState(60);
  const [rateLimitRPD, setRateLimitRPD] = useState<string>('');
  const [telemetryDetailLevel, setTelemetryDetailLevel] = useState<'off' | 'metadata' | 'full'>('off');
  // Widget appearance (embedConfig) is edited inline on the experience detail
  // page in `WidgetAppearanceCard`, alongside the embed-code snippet. Keeping
  // it out of this form avoids two editors for the same data.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false);

  interface AIProvider {
    id: string; key: string; name: string;
    models: Array<{ id: number; key: string; name: string; type: string }>;
  }
  interface ResolvedDefaults {
    chat: { providerId: string | null; providerKey: string | null; modelId: number | null; modelKey: string | null };
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
  const selectedProvider = providers.find((p) => p.id === providerId);
  const chatModels = selectedProvider?.models.filter((m) => m.type === 'chat') ?? [];
  const defaultChat = resolvedData?.chat;

  function handleProviderChange(value: string) {
    if (value === '__default__') {
      setProviderId(null);
      setModelId(null);
    } else {
      const provider = providers.find((p) => p.id === value);
      const firstChatModel = provider?.models.find((m) => m.type === 'chat');
      setProviderId(value);
      setModelId(firstChatModel?.id ?? null);
    }
  }

  useEffect(() => {
    if (experience) {
      setName(experience.name);
      setDescription(experience.description ?? '');
      setPipelineMode(experience.pipelineMode as PipelineMode);
      const persona_ = experience.personaConfig as Record<string, unknown> | null;
      setPersona((persona_?.systemInstructions as string) ?? '');
      setTone(((persona_?.tone as string) ?? 'professional') as typeof tone);
      setProviderId(experience.providerId ?? null);
      setModelId(experience.modelId ?? null);
      const sc = experience.sessionConfig as Record<string, unknown> | null;
      setMaxContextMessages((sc?.maxContextMessages as number) ?? 20);
      const ac = experience.accessConfig as Record<string, unknown> | null;
      setAllowedOrigins((ac?.allowedOrigins as string[]) ?? []);
      const rl = (ac?.rateLimits as { chatPerMinute?: number; requestsPerDay?: number | null }) ?? {};
      setRateLimitCPM(rl?.chatPerMinute ?? 60);
      setRateLimitRPD(rl?.requestsPerDay ? String(rl.requestsPerDay) : '');
      const oc = experience.observabilityConfig as Record<string, unknown> | null;
      setTelemetryDetailLevel(((oc?.telemetryDetailLevel as string) ?? 'off') as 'off' | 'metadata' | 'full');
    }
  }, [experience]);

  function addOrigin() {
    const origin = originInput.trim();
    if (!origin || allowedOrigins.includes(origin)) return;
    setAllowedOrigins((prev) => [...prev, origin]);
    setOriginInput('');
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSubmitError(null);
    try {
      await updateExperience({
        name,
        description: description.trim() || undefined,
        pipelineMode,
        personaConfig: {
          ...(experience!.personaConfig as Record<string, unknown>),
          systemInstructions: persona || 'You are a helpful AI assistant.',
          tone,
        },
        sessionConfig: { maxContextMessages },
        accessConfig: {
          allowedOrigins,
          rateLimits: {
            chatPerMinute: rateLimitCPM,
            requestsPerDay: rateLimitRPD ? Number(rateLimitRPD) : 10000,
          },
          // Preserve whatever the detail page's Widget Appearance editor saved.
          // Updating accessConfig replaces the whole blob server-side, so we must
          // round-trip the existing embedConfig here.
          ...(() => {
            const existingEmbed = (experience!.accessConfig as Record<string, unknown> | null)?.embedConfig;
            return existingEmbed ? { embedConfig: existingEmbed } : {};
          })(),
        },
        observabilityConfig: { telemetryDetailLevel },
        providerId: providerId ?? null,
        modelId: modelId ?? null,
      });
      router.push(`${basePath}/${id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save');
    }
  }

  /** Mirrors backend buildSystemPrompt — shows the full composed prompt the AI will receive */
  function buildPromptPreview(): string {
    const parts: string[] = [];

    // 1. Core identity
    if (persona?.trim()) {
      parts.push(persona.trim());
    } else {
      parts.push('You are a helpful AI assistant.');
    }

    // 2. Tone
    const toneGuide: Record<string, string> = {
      professional: 'Maintain a professional, clear, and authoritative tone.',
      friendly: 'Be warm, approachable, and conversational.',
      casual: 'Keep your tone relaxed and informal.',
      enthusiastic: 'Be upbeat, energetic, and encouraging.',
      concise: 'Be brief and to the point. Avoid unnecessary detail.',
    };
    if (tone && toneGuide[tone]) parts.push(toneGuide[tone]);

    // 3. Tool awareness
    const tools = (experience?.tools ?? []).filter(
      (a: { isEnabled: boolean; tool: { isActive: boolean } }) => a.isEnabled && a.tool.isActive,
    );
    if (tools.length > 0) {
      const toolLines = tools.map((a: { overrideAiDescription: string | null; tool: { aiDescription: string; name: string; operation: string | null } }) => {
        const desc = (a.overrideAiDescription ?? a.tool.aiDescription) || a.tool.name;
        return `- **${a.tool.name}**: ${desc}`;
      });
      parts.push('You have access to the following tools:\n' + toolLines.join('\n'));

      // Workflow guidance
      const ops = new Set(tools.map((a: { tool: { operation: string | null } }) => a.tool.operation).filter(Boolean));
      const workflow: string[] = ['## How to use your tools effectively'];
      workflow.push('Never fabricate information that a tool could provide — call the tool instead.');
      if (ops.has('inspect') || ops.has('enumerate')) {
        workflow.push('');
        workflow.push('**Before searching**, gather context:');
        if (ops.has('inspect')) workflow.push('1. Use the inspect tool to understand the data schema, available fields, and filter options.');
        if (ops.has('enumerate')) workflow.push(`${ops.has('inspect') ? '2' : '1'}. Use the enumerate tool to discover valid filter values before applying filters.`);
      }
      if (ops.has('search')) {
        workflow.push(`${ops.has('inspect') && ops.has('enumerate') ? '3. Then search' : ops.has('inspect') || ops.has('enumerate') ? '2. Then search' : 'Search'} with precise filters and relevant keywords rather than sending the user's raw message as the query.`);
      }
      if (ops.has('lookup')) workflow.push('- Use the lookup tool when you have a specific document ID and need its full details.');
      workflow.push('');
      workflow.push('**Important:**');
      workflow.push("- If the user's request is vague, ask a clarifying question before searching.");
      workflow.push('- Use filters to narrow results rather than relying solely on keyword search.');
      workflow.push('- Present results clearly with key details the user asked about.');
      parts.push(workflow.join('\n'));
    }

    return parts.join('\n\n');
  }

  if (isLoading || !experience) {
    return (
      <div className="flex-1 p-6 lg:p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-16 bg-muted rounded-2xl" />
          <div className="h-64 bg-muted rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      <PageHeader
        variant="detail"
        title={`Edit ${experience.name}`}
        description="Update AI experience settings, pipeline mode, and access control."
        breadcrumb={
          <>
            <Link href={listHref} className="hover:text-foreground transition-colors font-medium">Experiences</Link>
            <ChevronRight className="size-3.5" />
            <Link href={`${basePath}/${id}`} className="hover:text-foreground transition-colors font-medium truncate max-w-[160px]">{experience.name}</Link>
            <ChevronRight className="size-3.5" />
            <span className="text-foreground font-medium">Edit</span>
          </>
        }
        customIcon={
          <div className="flex size-12 items-center justify-center rounded-xl bg-indigo-500/10">
            <Bot className="size-6 text-indigo-500" />
          </div>
        }
        badge={<PipelineModeChip mode={pipelineMode} />}
        actions={
          <Button className="rounded-xl" onClick={handleSave} disabled={isUpdating}>
            {isUpdating ? <><Loader2 className="size-4 mr-2 animate-spin" />Saving…</> : <><Save className="size-4 mr-2" />Save Changes</>}
          </Button>
        }
      />

      <div className="space-y-6 max-w-3xl">
        {/* Basic Info */}
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className={`rounded-xl ${errors.name ? 'border-destructive' : ''}`} />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="rounded-xl resize-none" />
            </div>

            {/* Pipeline Mode */}
            <div className="space-y-2">
              <Label>Pipeline Mode</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(PIPELINE_MODE_CONFIG).map(([mode, cfg]) => {
                  const Icon = cfg.icon;
                  const selected = pipelineMode === mode;
                  return (
                    <button key={mode} type="button" onClick={() => setPipelineMode(mode as PipelineMode)}
                      className={`flex items-start gap-3.5 rounded-xl border p-4 text-left transition-all ${selected ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border/60 bg-card hover:border-border hover:bg-muted/30'}`}>
                      <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${cfg.iconBg}`}>
                        <Icon className={`size-5 ${cfg.iconClass}`} />
                      </div>
                      <div>
                        <p className={`font-semibold text-sm ${selected ? 'text-primary' : ''}`}>{cfg.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{cfg.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Config */}
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">AI Configuration</CardTitle>
            <CardDescription>Provider, model, and persona settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  <Select value={providerId ?? '__default__'} onValueChange={handleProviderChange}>
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
                    value={modelId != null ? String(modelId) : '__default__'}
                    onValueChange={(v) => setModelId(v === '__default__' ? null : Number(v))}
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
              {!providerId && defaultChat?.providerKey && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="inline-block size-1.5 rounded-full bg-emerald-500 shrink-0" />
                  System default: <span className="font-mono">{defaultChat.providerKey}</span>
                  {defaultChat.modelKey && <> / <span className="font-mono">{defaultChat.modelKey}</span></>}
                </p>
              )}
            </div>

            {/* System Instructions */}
            <div className="space-y-1.5">
              <Label>System Instructions</Label>
              <Textarea value={persona} onChange={(e) => setPersona(e.target.value)} rows={3} className="rounded-xl resize-none" placeholder="You are a helpful assistant…" />
              <p className="text-xs text-muted-foreground">
                Your instructions form the base. The platform automatically adds tone, tool awareness, and workflow guidance at runtime.
              </p>
            </div>

            {/* Prompt Preview */}
            <div className="border border-border/60 rounded-xl overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                onClick={() => setPromptPreviewOpen((o) => !o)}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Eye className="size-4 text-muted-foreground" />
                  Full Prompt Preview
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 rounded-md font-normal">auto-composed</Badge>
                </div>
                <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${promptPreviewOpen ? 'rotate-0' : '-rotate-90'}`} />
              </button>
              {promptPreviewOpen && (
                <div className="px-4 py-3 border-t border-border/40">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto">
                    {buildPromptPreview()}
                  </pre>
                </div>
              )}
            </div>

            {/* Tone */}
            <div className="space-y-1.5">
              <Label>Tone</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {[
                    { value: 'professional', label: 'Professional' },
                    { value: 'friendly', label: 'Friendly' },
                    { value: 'casual', label: 'Casual' },
                    { value: 'enthusiastic', label: 'Enthusiastic' },
                    { value: 'concise', label: 'Concise' },
                  ].map((t) => (
                    <SelectItem key={t.value} value={t.value} className="rounded-lg">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Context Messages */}
            <div className="space-y-1.5">
              <Label>Context Messages</Label>
              <Input type="number" min={1} max={50} value={maxContextMessages} onChange={(e) => setMaxContextMessages(Number(e.target.value))} className="rounded-xl" />
              <p className="text-xs text-muted-foreground">Max chat history turns sent to the model (1–50).</p>
            </div>
          </CardContent>
        </Card>

        {/* Access Control */}
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Access Control</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Allowed Origins</Label>
              <div className="flex gap-2">
                <Input value={originInput} onChange={(e) => setOriginInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addOrigin())}
                  placeholder="https://your-site.com" className="rounded-xl flex-1 font-mono text-sm" />
                <Button type="button" variant="outline" className="rounded-xl gap-1" onClick={addOrigin}>
                  <Plus className="size-4" />Add
                </Button>
              </div>
              {allowedOrigins.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {allowedOrigins.map((origin) => (
                    <Badge key={origin} variant="secondary" className="rounded-lg px-2.5 py-1 text-xs gap-1.5 font-mono">
                      {origin}
                      <button type="button" onClick={() => setAllowedOrigins((prev) => prev.filter((o) => o !== origin))} className="hover:text-destructive">
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Empty = all origins allowed.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Chats / Minute</Label>
                <Input type="number" min={1} max={1000} value={rateLimitCPM} onChange={(e) => setRateLimitCPM(Number(e.target.value))} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label>Requests / Day</Label>
                <Input type="number" min={1} value={rateLimitRPD} onChange={(e) => setRateLimitRPD(e.target.value)} placeholder="Unlimited" className="rounded-xl" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Widget Appearance lives on the experience detail page
            (WidgetAppearanceCard), next to the Embed Code card. */}

        {/* Settings */}
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
              <div>
                <Label className="text-sm font-medium">Telemetry</Label>
                <p className="text-xs text-muted-foreground">Control what data is recorded in traces</p>
              </div>
              <select
                className="rounded-lg border bg-background px-3 py-1.5 text-sm"
                value={telemetryDetailLevel}
                onChange={(e) => setTelemetryDetailLevel(e.target.value as 'off' | 'metadata' | 'full')}
              >
                <option value="off">Off</option>
                <option value="metadata">Metadata only</option>
                <option value="full">Full (includes messages)</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <Button variant="outline" className="rounded-xl" onClick={() => router.push(`${basePath}/${id}`)}>Cancel</Button>
          <div className="flex items-center gap-3">
            {submitError && <p className="text-sm text-destructive">{submitError}</p>}
            <Button className="rounded-xl" onClick={handleSave} disabled={isUpdating}>
              {isUpdating ? <><Loader2 className="size-4 mr-2 animate-spin" />Saving…</> : <><Save className="size-4 mr-2" />Save Changes</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
