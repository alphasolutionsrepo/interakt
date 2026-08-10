'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ChevronDown, Loader2, Save, Bot, Plus, X, Eye } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import type { PipelineMode, ExecutionPolicyOverrides } from '../_lib/api-client';
import { useAIExperience } from '../_lib/hooks/useAIExperiences';

import { AdvancedGroup, EditAdvanced, EditSection, EditSectionNav } from './EditSection';
import { ExecutionPolicyEditor } from './ExecutionPolicyEditor';
import { GuardrailsSection } from './GuardrailsSection';
import { McpAttachmentPanel } from './McpAttachmentPanel';
import { ResponsePresetsEditor } from './pipeline/ResponsePresetsEditor';
import { ExperienceBadges } from './ExperienceBadges';
import { PromptOverridePanel } from './PromptOverridePanel';
import { ToolAssignmentPanel } from './ToolAssignmentPanel';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/shared/ui/custom/PageHeader';

interface AIExperienceEditProps {
  id: string;
  basePath?: string;
  listPath?: string;
}

export function AIExperienceEdit({ id, basePath = '/ai-experiences', listPath }: AIExperienceEditProps) {
  const listHref = listPath ?? basePath;
  const router = useRouter();
  const {
    experience, isLoading, updateExperience, isUpdating, refetch,
    assignTool, updateToolAssignment, removeTool, isAssigningTool, isRemovingTool,
  } = useAIExperience(id);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>('deterministic');
  const [executionPolicy, setExecutionPolicy] = useState<ExecutionPolicyOverrides | null>(null);
  const [persona, setPersona] = useState('');
  const [tone, setTone] = useState<'professional' | 'friendly' | 'casual' | 'enthusiastic' | 'concise'>('professional');
  const [providerId, setProviderId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<number | null>(null);
  const [maxContextMessages, setMaxContextMessages] = useState(20);
  const [sessionTtlMinutes, setSessionTtlMinutes] = useState(1440);
  const [summaryThreshold, setSummaryThreshold] = useState(30);
  const [enableConversationSummary, setEnableConversationSummary] = useState(false);
  const [enableUserContext, setEnableUserContext] = useState(false);
  const [enabledPresets, setEnabledPresets] = useState<string[]>(['rich_text']);
  const [defaultPreset, setDefaultPreset] = useState('rich_text');
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

  /*
    Hydrate the form once per experience, not on every refetch.

    This effect used to depend on `experience`, which is a React Query result whose identity
    changes on every refetch. Several sections on this page save immediately — guardrails, tools,
    prompts — and each of those invalidates the query, so an unrelated toggle silently replaced
    every unsaved field in the form with whatever the server last stored.

    Two ways that hurt. Edits in progress vanished with no message. And worse, the reverse: a
    field the operator had cleared came back from the server mid-edit and was then written out by
    Save, so the form appeared to add settings nobody touched. That is what it looked like from
    the outside — Save quietly enabling a response preset — and it is why this is keyed on the id
    rather than the object.

    Refetches still update everything the panels read straight from `experience`; only the
    form-owned fields are pinned, and only until you navigate to a different experience.
  */
  const hydratedFor = useRef<string | null>(null);

  useEffect(() => {
    if (experience && hydratedFor.current !== experience.id) {
      hydratedFor.current = experience.id;
      setName(experience.name);
      setDescription(experience.description ?? '');
      setPipelineMode(experience.pipelineMode as PipelineMode);
      setExecutionPolicy(experience.executionPolicy ?? null);
      const persona_ = experience.personaConfig as Record<string, unknown> | null;
      setPersona((persona_?.systemInstructions as string) ?? '');
      setTone(((persona_?.tone as string) ?? 'professional') as typeof tone);
      setProviderId(experience.providerId ?? null);
      setModelId(experience.modelId ?? null);
      const sc = experience.sessionConfig as Record<string, unknown> | null;
      setMaxContextMessages((sc?.maxContextMessages as number) ?? 20);
      setSessionTtlMinutes((sc?.sessionTtlMinutes as number) ?? 1440);
      setSummaryThreshold((sc?.summaryThreshold as number) ?? 30);
      setEnableConversationSummary((sc?.enableConversationSummary as boolean) ?? false);
      setEnableUserContext((sc?.enableUserContext as boolean) ?? false);
      const formats = (persona_?.responseFormats ?? {}) as Record<string, unknown>;
      setEnabledPresets((formats.enabledPresets as string[]) ?? ['rich_text']);
      setDefaultPreset((formats.defaultPreset as string) ?? 'rich_text');
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
        executionPolicy,
        personaConfig: {
          ...(experience!.personaConfig as Record<string, unknown>),
          systemInstructions: persona || 'You are a helpful AI assistant.',
          tone,
          responseFormats: {
            ...((experience!.personaConfig as Record<string, unknown>)?.responseFormats as Record<string, unknown> ?? {}),
            enabledPresets,
            defaultPreset,
          },
        },
        // Spread the existing object: the service replaces sessionConfig wholesale, so
        // sending only the fields this form knows about silently destroyed the rest. Every
        // one of them is now edited here, but the spread stays as the guard against the same
        // bug returning the next time a field is added to the config.
        sessionConfig: {
          ...(experience!.sessionConfig as Record<string, unknown>),
          maxContextMessages,
          sessionTtlMinutes,
          summaryThreshold,
          enableConversationSummary,
          enableUserContext,
        },
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
        badge={<ExperienceBadges mode={pipelineMode} executionPolicy={executionPolicy} guardrailConfig={experience.guardrailConfig as Record<string, unknown> | null} />}
        actions={
          <Button className="rounded-xl" onClick={handleSave} disabled={isUpdating}>
            {isUpdating ? <><Loader2 className="size-4 mr-2 animate-spin" />Saving…</> : <><Save className="size-4 mr-2" />Save Changes</>}
          </Button>
        }
      />

      <div className="space-y-6 max-w-3xl">
        {/*
          Four decisions, then everything that ships with an answer already in it.

          The page had ten numbered stages covering roughly thirty-five controls, of which
          someone setting up an experience changes about five. Regrouping the headings would
          have made that tidier without making it shorter, so the split is by whether a
          setting needs a decision at all: what it is, what it can do, what it must not do,
          and how it thinks. Guardrails moved above the turn budget because what an assistant
          must not do is a first-order question and a token ceiling is not.
        */}
        <EditSectionNav
          sections={[
            { step: 1, title: 'Identity' },
            { step: 2, title: 'Capabilities' },
            { step: 3, title: 'Guardrails' },
            { step: 4, title: 'Intelligence' },
          ]}
        />

        <EditSection
          step={1}
          title="Identity"
          description="What this experience is called."
        >
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className={`rounded-xl ${errors.name ? 'border-destructive' : ''}`} />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="rounded-xl resize-none" />
            </div>

          </EditSection>

        {/* AI Config */}
        <EditSection
          step={2}
          title="Capabilities"
          description="What this experience can do. Tools are what the planner may call; MCP servers contribute their tools live."
          savesImmediately
        >
          <ToolAssignmentPanel
            experienceId={id}
            assignments={experience.tools}
            onAssign={async (payload) => { await assignTool(payload); await refetch(); }}
            onUpdateAssignment={async (toolId, data) => { await updateToolAssignment({ toolId, data }); }}
            onRemove={async (toolId) => { await removeTool(toolId); await refetch(); }}
            isAssigning={isAssigningTool}
            isRemovingTool={isRemovingTool}
          />
          <div className="pt-2 border-t border-border/50">
            <McpAttachmentPanel experienceId={id} />
          </div>
        </EditSection>

        {/*
          Guardrails come before the model and the persona. What an assistant must not do is
          the decision a reviewer asks about; which model writes the prose is not.
        */}
        <EditSection
          step={3}
          title="Guardrails"
          description="What is checked before a message reaches the model, and before a reply reaches the user. Changes here save immediately — they do not wait for Save below."
          savesImmediately
        >
          <GuardrailsSection
            guardrailConfig={experience.guardrailConfig as Record<string, unknown> | null}
            onUpdate={async (payload) => { await updateExperience(payload); }}
          />
        </EditSection>

        <EditSection
          step={4}
          title="Intelligence"
          description="Which model answers, and the voice it answers in."
        >
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

          </EditSection>

        <EditAdvanced>
          {/*
            The preset picker lives inside the editor. It used to sit above it as a pair of
            cards, which read as the whole decision and left the limits below looking like
            unrelated advanced settings — so selecting "Governed" appeared to govern nothing.
          */}
          <AdvancedGroup
            title="Turn budget"
            description="How much a single turn may spend before it gives up."
          >
            <ExecutionPolicyEditor
              mode={pipelineMode}
              onModeChange={setPipelineMode}
              value={executionPolicy}
              onChange={setExecutionPolicy}
            />
          </AdvancedGroup>

        {/* Conversation — what the model remembers of the session, and for how long. */}
        <AdvancedGroup
          title="Conversation"
          description="How much of the session the model sees, and how long a session lives."
        >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Context messages</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={maxContextMessages}
                  onChange={(e) => setMaxContextMessages(Number(e.target.value))}
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  Chat history turns sent to the model (1–50).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Session lifetime</Label>
                <Input
                  type="number"
                  min={5}
                  max={20160}
                  value={sessionTtlMinutes}
                  onChange={(e) => setSessionTtlMinutes(Number(e.target.value))}
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  Minutes of inactivity before a session expires.
                </p>
              </div>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 p-3.5">
              <div>
                <Label className="text-sm">Summarize long conversations</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Once a session passes the threshold, older turns are replaced by a summary
                  so the context window holds.
                </p>
              </div>
              <Switch
                checked={enableConversationSummary}
                onCheckedChange={setEnableConversationSummary}
              />
            </div>

            {enableConversationSummary && (
              <div className="space-y-1.5">
                <Label>Summary threshold</Label>
                <Input
                  type="number"
                  min={5}
                  max={200}
                  value={summaryThreshold}
                  onChange={(e) => setSummaryThreshold(Number(e.target.value))}
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  Messages before summarising begins.
                </p>
              </div>
            )}

            <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 p-3.5">
              <div>
                <Label className="text-sm">Remember users across sessions</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Retrieves what earlier sessions learned about the same user. Requires a user
                  id on the session.
                </p>
              </div>
              <Switch checked={enableUserContext} onCheckedChange={setEnableUserContext} />
            </div>
          </AdvancedGroup>

        {/* Response formatting — part of the form, because personaConfig has one writer. */}
        <AdvancedGroup
          title="Response format"
          description="Which UI presets the pipeline may choose from when it answers."
        >
            <ResponsePresetsEditor
              enabledPresets={enabledPresets}
              defaultPreset={defaultPreset}
              editable
              onChange={(next) => {
                setEnabledPresets(next.enabledPresets);
                setDefaultPreset(next.defaultPreset);
              }}
            />
          </AdvancedGroup>

        <AdvancedGroup
          title="Prompts"
          description="Which prompt template each pipeline step uses. The turn planner decides which tools to call, so this is where planning behavior is tuned beyond the budget above."
          savesImmediately
        >
          <PromptOverridePanel experienceId={id} />
        </AdvancedGroup>

        <AdvancedGroup
          title="Access"
          description="Who may call this experience, and how often."
        >
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
          </AdvancedGroup>

        {/* Widget Appearance lives on the experience detail page
            (WidgetAppearanceCard), next to the Embed Code card. */}

        {/* Settings */}
        <AdvancedGroup
          title="Telemetry"
          description="What a turn records in traces."
        >
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
          </AdvancedGroup>
        </EditAdvanced>

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
