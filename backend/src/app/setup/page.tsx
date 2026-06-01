'use client';

import {
  Rocket,
  RefreshCw,
  Trash2,
  Check,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Bot,
  Layers,
  ListTree,
  Package,
  Wrench,
  Search,
  MessageSquare,
  Activity,
  BarChart3,
  FileText,
  CheckCircle2,
  Circle,
  ArrowRight,
  Cpu,
  Cloud,
  KeyRound,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StepProgress } from '@/components/ui/steps-progress';
import { DEMO_SEED_STEPS, type DemoStepId, type SeedProgressEvent } from '@/shared/seeders/demo/demo-steps';
import { DocsAssistantCard } from './_components/DocsAssistantCard';

interface ProviderView {
  key: string;
  label: string;
  tagline?: string;
  authType: 'none' | 'api_key';
  requiredModels: string[];
  defaultBaseUrl?: string;
  defaults: { chatModel: string; textModel: string; embeddingModel: string };
  inCatalog: boolean;
  ready: boolean;
  hasStoredKey?: boolean;
  baseUrl?: string;
  reachable?: boolean;
  pulledModels?: string[];
  pulledChatModels?: string[];
  pulledEmbeddingModels?: string[];
  missingModels?: string[];
}

interface DemoStatus {
  seeded: boolean;
  seededAt: string | null;
  seededProvider: string | null;
  providers: { recommended: string; options: ProviderView[] };
  manifest: {
    name: string;
    indexName: string;
    documents: number;
    fields: number;
    searchExperienceSlug: string;
    chatExperienceSlug: string;
    warmupEnabled: boolean;
  };
}

interface SeedResult {
  action: string;
  skipped?: boolean;
  reason?: string;
  provider?: string;
  index?: { name: string; documents: number; embeddings: number };
  searchExperience?: { slug: string; accessToken: string };
  chatExperience?: { slug: string; accessToken: string };
  warmup?: { searchesRun: number; chatTurnsRun: number; analyticsChatTurnsRun: number };
  deleted?: string[];
}

type StepState = 'pending' | 'active' | 'done';

const ENDPOINT = '/api/admin/setup-demo';

const STEP_ICON: Record<DemoStepId, LucideIcon> = {
  provider: Bot,
  index: Layers,
  fields: ListTree,
  documents: Package,
  tools: Wrench,
  search: Search,
  chat: MessageSquare,
  warmup: Activity,
};

export default function SetupDemoPage() {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [chatModel, setChatModel] = useState('');
  const [embeddingModel, setEmbeddingModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [checkedBaseUrl, setCheckedBaseUrl] = useState('');
  const [rechecking, setRechecking] = useState(false);
  const [warmup, setWarmup] = useState(true);
  const [busy, setBusy] = useState<null | 'seed' | 'reset'>(null);
  const [result, setResult] = useState<SeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live progress for the streamed seed.
  const [stepStates, setStepStates] = useState<Record<string, StepState>>({});
  const [stepDetails, setStepDetails] = useState<Record<string, string>>({});

  async function loadStatus(ollamaBaseUrl?: string) {
    try {
      const url = ollamaBaseUrl ? `${ENDPOINT}?ollamaBaseUrl=${encodeURIComponent(ollamaBaseUrl)}` : ENDPOINT;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) return;
      const data: DemoStatus = json.data ?? json;
      setStatus(data);

      // Initialise selection + base URL on first load (don't clobber edits).
      setSelectedProvider((prev) => prev || data.providers.recommended);
      const ollama = data.providers.options.find((o) => o.authType === 'none');
      if (ollama?.baseUrl) {
        setBaseUrl((prev) => prev || ollama.baseUrl!);
        setCheckedBaseUrl(ollama.baseUrl);
      }
    } catch {
      /* status is best-effort */
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function recheckOllama() {
    setRechecking(true);
    await loadStatus(baseUrl);
    setRechecking(false);
  }

  const selected = status?.providers.options.find((o) => o.key === selectedProvider);
  const baseUrlDirty = selected?.authType === 'none' && baseUrl.trim() !== checkedBaseUrl.trim();

  // Keep the chosen models valid for the selected provider. For Ollama the
  // pickers offer the pulled models (prefer the current pick, then the
  // recommended default, then the first available). For a key-based provider
  // (OpenAI) the fields are free text, seeded with the recommended defaults.
  useEffect(() => {
    if (!selected) return;
    if (selected.authType === 'none') {
      const chats = selected.pulledChatModels ?? [];
      const embeds = selected.pulledEmbeddingModels ?? [];
      setChatModel((prev) =>
        prev && chats.includes(prev) ? prev : chats.includes(selected.defaults.chatModel) ? selected.defaults.chatModel : chats[0] ?? '',
      );
      setEmbeddingModel((prev) =>
        prev && embeds.includes(prev) ? prev : embeds.includes(selected.defaults.embeddingModel) ? selected.defaults.embeddingModel : embeds[0] ?? '',
      );
    } else {
      setChatModel((prev) => prev || selected.defaults.chatModel);
      setEmbeddingModel((prev) => prev || selected.defaults.embeddingModel);
    }
  }, [
    selected?.key,
    selected?.authType,
    selected?.pulledChatModels,
    selected?.pulledEmbeddingModels,
    selected?.defaults.chatModel,
    selected?.defaults.embeddingModel,
  ]);

  function providerReady(opt: ProviderView | undefined): boolean {
    if (!opt || !opt.inCatalog) return false;
    if (opt.authType === 'api_key') return !!opt.hasStoredKey || apiKey.trim().length > 0;
    // Local (Ollama): reachable, with at least one model of each role pulled.
    return (
      !!opt.reachable &&
      (opt.pulledChatModels?.length ?? 0) > 0 &&
      (opt.pulledEmbeddingModels?.length ?? 0) > 0 &&
      !baseUrlDirty
    );
  }

  const ready = providerReady(selected);
  const mustResetToSwitch =
    !!status?.seeded && !!status.seededProvider && status.seededProvider !== selectedProvider;
  // Both a chat and an embedding model must be chosen before setup.
  const modelsIncomplete = !chatModel || !embeddingModel;
  const canSeed = ready && !mustResetToSwitch && !busy && !modelsIncomplete;

  // Steps shown in the stepper / live list — warm-up is included only when on.
  const visibleSteps = DEMO_SEED_STEPS.filter((s) => !s.warmupOnly || warmup);
  const doneCount = visibleSteps.filter((s) => stepStates[s.id] === 'done').length;
  const currentStep = doneCount + 1;
  const showStepper = busy === 'seed' || (doneCount > 0 && !error);

  function applyProgress(event: SeedProgressEvent) {
    setStepStates((prev) => ({ ...prev, [event.step]: event.status === 'done' ? 'done' : 'active' }));
    if (event.detail) setStepDetails((prev) => ({ ...prev, [event.step]: event.detail! }));
  }

  async function streamSeed(force: boolean) {
    setStepStates({});
    setStepDetails({});
    const body: Record<string, unknown> = {
      action: 'seed',
      provider: selectedProvider,
      force,
      warmup,
      stream: true,
    };
    if (selected?.authType === 'api_key') {
      if (apiKey.trim()) body.apiKey = apiKey.trim();
    } else {
      body.baseUrl = baseUrl.trim();
    }
    if (chatModel) body.chatModel = chatModel;
    if (embeddingModel) body.embeddingModel = embeddingModel;

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      const json = await res.json().catch(() => null);
      throw new Error(json?.error?.message ?? json?.message ?? `Request failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        let msg: { type?: string; data?: SeedResult; error?: string } & Partial<SeedProgressEvent>;
        try {
          msg = JSON.parse(payload);
        } catch {
          continue;
        }
        if (msg.type === 'progress' && msg.step) {
          applyProgress(msg as SeedProgressEvent);
        } else if (msg.type === 'complete' && msg.data) {
          setResult(msg.data);
          setApiKey(''); // don't keep the key in component state after use
          await loadStatus();
        } else if (msg.type === 'error') {
          throw new Error(msg.error ?? 'Setup failed');
        }
      }
    }
  }

  async function run(action: 'seed' | 'reset', force = false) {
    setBusy(action);
    setError(null);
    setResult(null);
    try {
      if (action === 'seed') {
        await streamSeed(force);
      } else {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reset' }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error?.message ?? json.message ?? `Request failed (${res.status})`);
        } else {
          setResult(json.data ?? json);
          setStepStates({});
          setStepDetails({});
          await loadStatus();
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const providerStepDescription = selected
    ? `Connect ${selected.label} (chat: ${chatModel || selected.defaults.chatModel}, embeddings: ${embeddingModel || selected.defaults.embeddingModel}) and set them as the system defaults.`
    : DEMO_SEED_STEPS[0].description;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* ---------------------------------------------------------------- Header */}
      <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent p-6">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Rocket className="h-3 w-3" /> Getting started
          </Badge>
          {status?.seeded && (
            <Badge variant="secondary" className="gap-1 text-emerald-600">
              <Check className="h-3 w-3" /> Demo configured
              {status.seededProvider ? ` · ${status.seededProvider}` : ''}
            </Badge>
          )}
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Initial Setup</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Get Interakt ready to use. First connect an{' '}
          <Link href="/ai-providers" className="font-medium text-primary hover:underline">AI provider</Link>{' '}
          (it powers embeddings and chat) — then the in-app <span className="font-medium text-foreground">Documentation
          Assistant</span> builds automatically. Loading the sample demo data below is optional.
        </p>
      </div>

      {/* -------------------------------------------------- Documentation assistant */}
      <DocsAssistantCard />

      {/* -------------------------------------------------------- Demo data (optional) */}
      <div className="pt-2">
        <h2 className="text-lg font-semibold tracking-tight">
          Demo data <span className="text-sm font-normal text-muted-foreground">· optional</span>
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Load a sample <span className="font-medium text-foreground">Fashion Catalog</span> — a hybrid search index of{' '}
          {status?.manifest.documents ?? 200} products, the tools that query it, and public search &amp; chat
          experiences — then replay real queries so every analytics screen is pre-populated. Skip this if you only need
          the platform itself. <span className="font-medium text-foreground">Ollama</span> runs locally and free;{' '}
          <span className="font-medium text-foreground">OpenAI</span> gives the best quality.
        </p>
      </div>

      {/* ----------------------------------------------------- Provider chooser */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Choose your AI provider</CardTitle>
          <CardDescription>
            This powers embeddings (for search) and the chat assistant. Embedding size is baked into the index, so the
            provider can&apos;t be changed later without resetting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {status?.providers.options.map((opt) => {
              const isSel = opt.key === selectedProvider;
              const optReady = providerReady(opt);
              const Icon = opt.authType === 'none' ? Cpu : Cloud;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    if (opt.key === selectedProvider) return;
                    setSelectedProvider(opt.key);
                    // Reset picks so the init effect repopulates from the new provider.
                    setChatModel('');
                    setEmbeddingModel('');
                  }}
                  disabled={!!busy}
                  className={
                    'flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors ' +
                    (isSel ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent')
                  }
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">{opt.label}</span>
                    {opt.key === status?.providers.recommended && (
                      <Badge variant="secondary" className="text-[10px]">Recommended</Badge>
                    )}
                    <span className="ml-auto">
                      {optReady ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground/30" />
                      )}
                    </span>
                  </div>
                  {opt.tagline && <span className="text-xs text-muted-foreground">{opt.tagline}</span>}
                  <span className="text-xs text-muted-foreground">
                    {opt.defaults.chatModel} · {opt.defaults.embeddingModel}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Per-provider config + readiness */}
          {selected?.authType === 'api_key' && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="h-4 w-4" /> {selected.label} API key
              </label>
              <Input
                type="password"
                autoComplete="off"
                placeholder={selected.hasStoredKey ? '•••••••• (a key is already saved — leave blank to keep it)' : 'sk-…'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={!!busy}
              />
              <p className="text-xs text-muted-foreground">
                {selected.hasStoredKey
                  ? 'A key is already stored on this provider. Enter a new one only to replace it.'
                  : 'Stored on the provider record (not in any file). Used to embed the catalog and answer chats.'}
              </p>

              {/* Models — free text with sensible defaults. */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Bot className="h-4 w-4" /> Chat model
                  </label>
                  <Input
                    placeholder={selected.defaults.chatModel}
                    value={chatModel}
                    onChange={(e) => setChatModel(e.target.value)}
                    disabled={!!busy}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Layers className="h-4 w-4" /> Embedding model
                  </label>
                  <Input
                    placeholder={selected.defaults.embeddingModel}
                    value={embeddingModel}
                    onChange={(e) => setEmbeddingModel(e.target.value)}
                    disabled={!!busy}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Defaults to <code className="rounded bg-muted px-1">{selected.defaults.chatModel}</code> and{' '}
                <code className="rounded bg-muted px-1">{selected.defaults.embeddingModel}</code>. Type any model your key
                can access. Changing the embedding model changes the vector size, so it needs a reset if the demo is
                already built.
              </p>

              {!selected.inCatalog && (
                <p className="text-xs text-amber-600">
                  The {selected.label} provider isn&apos;t in the catalog yet — start the app once so boot seeding runs.
                </p>
              )}
            </div>
          )}

          {selected?.authType === 'none' && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Cpu className="h-4 w-4" /> Ollama server
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="max-w-xs"
                  placeholder="http://localhost:11434"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  disabled={!!busy}
                />
                <Button variant="outline" size="sm" onClick={recheckOllama} disabled={rechecking || !!busy}>
                  {rechecking ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-2 h-3 w-3" />}
                  Re-check
                </Button>
                {selected.reachable ? (
                  <Badge variant="secondary" className="gap-1 text-emerald-600">
                    <CheckCircle2 className="h-3 w-3" /> Reachable
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-amber-600">
                    <AlertTriangle className="h-3 w-3" /> Not reachable
                  </Badge>
                )}
              </div>

              {!selected.reachable && (
                <p className="text-xs text-muted-foreground">
                  Couldn&apos;t reach Ollama at this URL. Install it from{' '}
                  <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    ollama.com
                  </a>
                  , start it (<code className="rounded bg-muted px-1">ollama serve</code>), then re-check.
                </p>
              )}

              {/* Chat model picker — choose from models pulled on this server. */}
              {selected.reachable && (
                <div className="space-y-1.5 border-t pt-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Bot className="h-4 w-4" /> Chat model
                  </label>
                  {(selected.pulledChatModels?.length ?? 0) > 0 ? (
                    <>
                      <Select value={chatModel} onValueChange={setChatModel} disabled={!!busy}>
                        <SelectTrigger className="max-w-xs">
                          <SelectValue placeholder="Select a chat model" />
                        </SelectTrigger>
                        <SelectContent>
                          {selected.pulledChatModels!.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                              {m === selected.defaults.chatModel ? ' · recommended' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Answers the chat — pick any model pulled on this server.{' '}
                        {!selected.pulledChatModels!.includes(selected.defaults.chatModel) && (
                          <>
                            For best quality, pull the recommended{' '}
                            <code className="rounded bg-muted px-1">{selected.defaults.chatModel}</code> and re-check.
                          </>
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-amber-600">
                      No chat models pulled yet — pull one (recommended{' '}
                      <code className="rounded bg-muted px-1">ollama pull {selected.defaults.chatModel}</code>), then re-check.
                    </p>
                  )}
                </div>
              )}
              {/* Embedding model picker — choose from models pulled on this server. */}
              {selected.reachable && (
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Layers className="h-4 w-4" /> Embedding model
                  </label>
                  {(selected.pulledEmbeddingModels?.length ?? 0) > 0 ? (
                    <>
                      <Select value={embeddingModel} onValueChange={setEmbeddingModel} disabled={!!busy}>
                        <SelectTrigger className="max-w-xs">
                          <SelectValue placeholder="Select an embedding model" />
                        </SelectTrigger>
                        <SelectContent>
                          {selected.pulledEmbeddingModels!.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                              {m === selected.defaults.embeddingModel ? ' · recommended' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Powers hybrid search. Changing it rebuilds the index, so it needs a reset if the demo is already
                        built.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-amber-600">
                      No embedding models pulled yet — pull one (recommended{' '}
                      <code className="rounded bg-muted px-1">ollama pull {selected.defaults.embeddingModel}</code>), then re-check.
                    </p>
                  )}
                </div>
              )}
              {baseUrlDirty && (
                <p className="text-xs text-amber-600">You changed the URL — re-check before setting up.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------- What gets set up + live progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. What this sets up</CardTitle>
          <CardDescription>
            Created in dependency order, idempotently — safe to re-run.{' '}
            {showStepper ? 'Watching it build live.' : 'Each row lights up as it builds.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {showStepper && (
            <div className="px-1 pb-2">
              <StepProgress currentStep={currentStep} steps={visibleSteps.map((s) => s.label)} />
            </div>
          )}

          <ol className="space-y-1">
            {visibleSteps.map((step, i) => {
              const state = stepStates[step.id] ?? 'pending';
              const Icon = STEP_ICON[step.id];
              const detail = stepDetails[step.id];
              const description = step.id === 'provider' ? providerStepDescription : step.description;
              return (
                <li
                  key={step.id}
                  className={
                    'flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors ' +
                    (state === 'active' ? 'bg-primary/5' : '')
                  }
                >
                  <div className="mt-0.5 shrink-0">
                    {state === 'done' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : state === 'active' ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground/30" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">{i + 1}</span>
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className={'text-sm font-medium ' + (state === 'pending' ? 'text-muted-foreground' : '')}>
                        {step.label === 'Products' ? '200 products' : step.label}
                      </span>
                      {step.longRunning && state !== 'done' && (
                        <Badge variant="outline" className="text-[10px] font-normal">takes longest</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {detail && state !== 'pending' ? detail : description}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          <Accordion type="single" collapsible>
            <AccordionItem value="how" className="border-none">
              <AccordionTrigger className="py-2 text-sm text-muted-foreground hover:text-foreground">
                How it works (and how to do it by hand)
              </AccordionTrigger>
              <AccordionContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  The whole demo is declared in one file —{' '}
                  <code className="rounded bg-muted px-1">backend/setup/data/demo.manifest.yaml</code>. Setup reads it
                  and creates each entity through the same services the admin screens use, so the result is identical to
                  clicking through them yourself: Providers → Search Indexes → Tools/Data Sources → Experiences.
                </p>
                <p>
                  <span className="font-medium text-foreground">Hybrid search</span> runs both keyword and semantic
                  (vector) search and fuses the results — that&apos;s why the products are embedded. The vector size
                  depends on the provider (OpenAI 1536-dim, Ollama 768-dim), so it&apos;s fixed at index-build time.
                </p>
                <p>
                  Re-running with the same provider is safe (unchanged config is skipped; use{' '}
                  <span className="font-medium text-foreground">Force re-seed</span> to rebuild). Switching providers
                  needs a <span className="font-medium text-foreground">Reset</span> first.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* ----------------------------------------------------- Switch-requires-reset */}
      {mustResetToSwitch && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Already set up with {status?.seededProvider}</AlertTitle>
          <AlertDescription>
            Switching to {selected?.label} rebuilds the index with a different embedding size. Reset the demo first,
            then set it up with {selected?.label}.
          </AlertDescription>
        </Alert>
      )}

      {/* --------------------------------------------------------------- Action card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Set it up</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={warmup} onChange={(e) => setWarmup(e.target.checked)} disabled={!!busy} />
            Include analytics &amp; traces warm-up
            <span className="text-muted-foreground">— replays demo queries so the dashboards aren&apos;t empty (adds ~a minute)</span>
          </label>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => run('seed', false)} disabled={!canSeed}>
              {busy === 'seed' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
              {status?.seeded && status.seededProvider === selectedProvider ? 'Re-run setup' : 'Set up demo'}
            </Button>

            {status?.seeded && status.seededProvider === selectedProvider && (
              <Button variant="outline" onClick={() => run('seed', true)} disabled={!canSeed}>
                <RefreshCw className="mr-2 h-4 w-4" /> Force re-seed
              </Button>
            )}

            <Button variant="destructive" onClick={() => run('reset')} disabled={!!busy || !status?.seeded}>
              {busy === 'reset' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Reset
            </Button>
          </div>

          {!ready && !mustResetToSwitch && selected && (
            <p className="text-sm text-amber-600">
              {selected.authType === 'api_key'
                ? `Enter your ${selected.label} API key above to continue.`
                : 'Ollama needs to be reachable with the required models pulled — see above.'}
            </p>
          )}
          {busy === 'reset' && <p className="text-sm text-muted-foreground">Tearing the demo down…</p>}
        </CardContent>
      </Card>

      {/* --------------------------------------------------------------------- Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Setup failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ----------------------------------------------------- Result + what's next */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Check className="h-4 w-4 text-emerald-600" />
              {result.action === 'reset'
                ? 'Demo reset'
                : result.skipped
                  ? 'Already configured'
                  : 'Demo ready 🎉'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {result.action === 'reset' && (
              <p className="text-muted-foreground">
                Removed {result.deleted?.length ?? 0} item(s). You can set the demo up again above.
              </p>
            )}
            {result.skipped && (
              <p className="text-muted-foreground">{result.reason} — use “Force re-seed” to rebuild.</p>
            )}
            {result.index && (
              <p className="text-muted-foreground">
                Index <code className="rounded bg-muted px-1">{result.index.name}</code> — {result.index.documents} docs,{' '}
                {result.index.embeddings} embeddings{result.provider ? ` via ${result.provider}` : ''}. Search at{' '}
                <code className="rounded bg-muted px-1">/{result.searchExperience?.slug}</code>, chat at{' '}
                <code className="rounded bg-muted px-1">/{result.chatExperience?.slug}</code>.
                {result.warmup && (
                  <>
                    {' '}
                    Warm-up ran {result.warmup.searchesRun} searches, {result.warmup.chatTurnsRun} chat turns and{' '}
                    {result.warmup.analyticsChatTurnsRun} analytics-chat turns.
                  </>
                )}
              </p>
            )}

            {result.action === 'seed' && !result.skipped && (
              <div>
                <p className="mb-2 font-medium">What&apos;s next — try it out:</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <NextStep href="/playground/search" icon={Search} title="Search playground" desc="Run a hybrid search against the catalog." />
                  <NextStep href="/experiences" icon={Bot} title="Your experiences" desc="Open the chat assistant, grab embed code." />
                  <NextStep href="/analytics/overview" icon={BarChart3} title="Analytics overview" desc="The dashboards the warm-up just populated." />
                  <NextStep href="/analytics/traces" icon={FileText} title="Traces" desc="End-to-end traces of every query." />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NextStep({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-accent"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-sm font-medium">
          {title}
          <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </Link>
  );
}
