// src/app/api/admin/setup-demo/route.ts
//
// Runs the Fashion Catalog demo setup from INSIDE the Next runtime (so the
// service layer, server-only, next-auth, search providers, and pipeline step
// handlers — all initialized at boot — work without the module-load issues a
// standalone script hits). Admin-only.
//
//   GET                      → status + per-provider readiness (the demo can run
//                              on ollama or openai; the page lets the user pick)
//   POST { action: 'seed' }  → configure the demo
//                              (body: { provider?, apiKey?, baseUrl?, force?, warmup?, stream? })
//   POST { action: 'reset' } → tear it down for a clean rebuild

import { NextRequest, NextResponse } from 'next/server';

import { SEED_TYPES } from '@/db/schema/seed-registry.schema';
import { getProviderByKey } from '@/features/ai-providers/ai-providers.service';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { loadDemoManifest, seedDemo, resetDemo, runWarmup } from '@/shared/seeders/demo';
import type { DemoProviderOption, SeedProgressEvent, WarmupSummary } from '@/shared/seeders/demo';
import { getRegistryEntry } from '@/shared/seeders/seed-registry.service';
import { getCurrentUser } from '@/shared/utils/auth-utils';

const logger = createLogger('setup-demo-api');

// Generous ceiling: embedding 200 docs + the warm-up replay can take a minute+.
export const maxDuration = 300;

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, res: apiResponse.unauthorized('You must be logged in') };
  if ((user as { role?: string }).role !== 'admin') {
    return { ok: false as const, res: apiResponse.forbidden('Admin role required') };
  }
  return { ok: true as const, user };
}

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  try {
    const loaded = await loadDemoManifest();
    const entry = await getRegistryEntry(SEED_TYPES.DEMO, loaded.manifest.demo.key);
    const meta = entry?.metadata as { seededAt?: string; provider?: string } | undefined;

    // Lets the page re-run the Ollama readiness check against a base URL the
    // user typed in, without seeding.
    const ollamaBaseUrlOverride = request.nextUrl.searchParams.get('ollamaBaseUrl') || undefined;

    // Per-provider readiness so the page can pre-select, guide, and gate the
    // Set up button before the user commits to a (slow) seed.
    const options = await Promise.all(
      Object.entries(loaded.manifest.provider.options).map(([id, option]) =>
        buildProviderReadiness(id, option, ollamaBaseUrlOverride),
      ),
    );

    return apiResponse.success({
      seeded: !!entry,
      seededAt: meta?.seededAt ?? null,
      seededProvider: meta?.provider ?? null,
      providers: {
        recommended: loaded.manifest.provider.recommended,
        options,
      },
      manifest: {
        name: loaded.manifest.demo.name,
        indexName: loaded.manifest.index.name,
        documents: loaded.documents.length,
        fields: loaded.mapping.fields.length,
        searchExperienceSlug: loaded.manifest.searchExperience.slug,
        chatExperienceSlug: loaded.manifest.chatExperience.slug,
        warmupEnabled: loaded.manifest.warmup.enabled,
      },
    });
  } catch (e) {
    logger.error('setup-demo status failed', e as Error);
    return apiResponse.error(e as Error);
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  let body: {
    action?: string;
    provider?: string;
    apiKey?: string;
    baseUrl?: string;
    chatModel?: string;
    embeddingModel?: string;
    force?: boolean;
    warmup?: boolean;
    stream?: boolean;
  } = {};
  try {
    body = await request.json();
  } catch {
    // empty body → default to seed
  }
  const action = body.action ?? 'seed';

  try {
    const loaded = await loadDemoManifest();

    if (action === 'reset') {
      const result = await resetDemo(loaded);
      logger.info('Demo reset via API', { deleted: result.deleted.length });
      return apiResponse.success({ action: 'reset', ...result });
    }

    if (action === 'seed') {
      const force = body.force ?? false;
      const wantWarmup = body.warmup ?? loaded.manifest.warmup.enabled;
      // Never logged — the key only flows from the request body to the seeder.
      const seedOpts = { force, provider: body.provider, apiKey: body.apiKey, baseUrl: body.baseUrl, chatModel: body.chatModel, embeddingModel: body.embeddingModel };

      // Streaming path (used by the setup page): emit a live step-by-step
      // progress feed over SSE, then a final `complete` event with the summary.
      if (body.stream) {
        return streamSeed(loaded, seedOpts, wantWarmup);
      }

      // Non-streaming path (scripts / programmatic callers): one JSON response.
      const summary = await seedDemo(loaded, seedOpts);
      let warmup: WarmupSummary | undefined;
      if (wantWarmup && !summary.skipped) {
        warmup = await runWarmup(loaded);
      }
      logger.info('Demo seeded via API', { provider: summary.provider, skipped: summary.skipped, warmup });
      return apiResponse.success({ action: 'seed', ...summary, warmup });
    }

    return apiResponse.badRequest(`Unknown action "${action}". Use "seed" or "reset".`);
  } catch (e) {
    logger.error('setup-demo failed', e as Error);
    return apiResponse.error(e as Error);
  }
}

// ---------------------------------------------------------------------------
// Readiness helpers
// ---------------------------------------------------------------------------

interface ProviderReadinessView {
  key: string;
  label: string;
  tagline?: string;
  authType: 'none' | 'api_key';
  requiredModels: string[];
  defaultBaseUrl?: string;
  defaults: DemoProviderOption['defaults'];
  inCatalog: boolean;
  ready: boolean;
  // api_key providers
  hasStoredKey?: boolean;
  // local providers (ollama)
  baseUrl?: string;
  reachable?: boolean;
  pulledModels?: string[];
  // Pulled models split by role — the Demo Setup page offers these in the chat
  // and embedding pickers. (Chat = everything that doesn't look like an embedder.)
  pulledChatModels?: string[];
  pulledEmbeddingModels?: string[];
  missingModels?: string[];
}

async function buildProviderReadiness(
  id: string,
  option: DemoProviderOption,
  ollamaBaseUrlOverride?: string,
): Promise<ProviderReadinessView> {
  const provider = await getProviderByKey(option.key).catch(() => null);
  const base: ProviderReadinessView = {
    key: id,
    label: option.label,
    tagline: option.tagline,
    authType: option.authType,
    requiredModels: option.requiredModels,
    defaultBaseUrl: option.defaultBaseUrl,
    defaults: option.defaults,
    inCatalog: !!provider,
    ready: false,
  };

  if (option.authType === 'api_key') {
    const hasStoredKey = provider?.hasApiKey ?? false;
    // "ready" once a key exists; the page also flips this true client-side as
    // soon as the user types a key.
    return { ...base, hasStoredKey, ready: !!provider && hasStoredKey };
  }

  // Local provider (ollama): live-check reachability + pulled models.
  const baseUrl =
    ollamaBaseUrlOverride ||
    (provider as { baseUrl?: string } | null)?.baseUrl ||
    (option.baseUrlEnv ? process.env[option.baseUrlEnv] : undefined) ||
    option.defaultBaseUrl ||
    'http://localhost:11434';
  const check = await checkOllama(baseUrl, option.requiredModels);
  const pulledChatModels = filterChatModels(check.pulledModels, option.defaults.embeddingModel);
  const pulledEmbeddingModels = filterEmbeddingModels(check.pulledModels, option.defaults.embeddingModel);
  return {
    ...base,
    baseUrl,
    reachable: check.reachable,
    pulledModels: check.pulledModels,
    pulledChatModels,
    pulledEmbeddingModels,
    missingModels: check.missingModels,
    // Ready once Ollama is reachable and there's at least one model of each role
    // to pick (the page's pickers default to the recommended models).
    ready: !!provider && check.reachable && pulledChatModels.length > 0 && pulledEmbeddingModels.length > 0,
  };
}

/** Does a pulled model look like an embedding model (by name or the configured default)? */
function isEmbeddingModel(model: string, embeddingModel: string): boolean {
  return model.split(':')[0] === embeddingModel.split(':')[0] || /embed/i.test(model);
}

/** Pulled models usable as a chat model — everything that doesn't look like an embedder. */
function filterChatModels(pulled: string[], embeddingModel: string): string[] {
  return pulled.filter((m) => !isEmbeddingModel(m, embeddingModel));
}

/** Pulled models usable as an embedding model — the configured default plus anything "embed". */
function filterEmbeddingModels(pulled: string[], embeddingModel: string): string[] {
  return pulled.filter((m) => isEmbeddingModel(m, embeddingModel));
}

/** Ping Ollama's /api/tags to see if it's up and which required models are pulled. */
async function checkOllama(
  baseUrl: string,
  requiredModels: string[],
): Promise<{ reachable: boolean; pulledModels: string[]; missingModels: string[] }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { reachable: false, pulledModels: [], missingModels: requiredModels };
    const json = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
    const pulled = (json.models ?? []).map((m) => m.name ?? m.model ?? '').filter(Boolean);
    const missing = requiredModels.filter((r) => !isModelPulled(r, pulled));
    return { reachable: true, pulledModels: pulled, missingModels: missing };
  } catch {
    return { reachable: false, pulledModels: [], missingModels: requiredModels };
  }
}

/** A required model is present if pulled exactly, or (no tag given) under any tag. */
function isModelPulled(required: string, pulled: string[]): boolean {
  if (pulled.includes(required)) return true;
  if (!required.includes(':')) return pulled.some((p) => p.split(':')[0] === required);
  return false;
}

/**
 * Run the seed (+ optional warm-up) while streaming step progress as SSE.
 * Matches the `data: {json}\n\n` / `[DONE]` convention used elsewhere (see
 * /api/analytics/process). Errors are emitted as an `error` event so the page
 * can surface them inline rather than failing the whole fetch.
 */
function streamSeed(
  loaded: Awaited<ReturnType<typeof loadDemoManifest>>,
  seedOpts: { force: boolean; provider?: string; apiKey?: string; baseUrl?: string; chatModel?: string; embeddingModel?: string },
  wantWarmup: boolean,
): Response {
  const encoder = new TextEncoder();
  // The warm-up replay can take a long time (multiple chat pipelines @ ~10-30s
  // each in dev). If the client disconnects mid-stream, the runtime closes the
  // controller from under us — any further enqueue throws "Invalid state".
  // Track close state ourselves and silently drop later writes.
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          // Stream was closed (e.g. client disconnected) — stop emitting.
          closed = true;
        }
      };
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };
      const emit = (msg: Record<string, unknown>) =>
        safeEnqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
      const onProgress = (event: SeedProgressEvent) => emit({ type: 'progress', ...event });

      try {
        const summary = await seedDemo(loaded, { ...seedOpts, onProgress });

        let warmup: WarmupSummary | undefined;
        if (wantWarmup && !summary.skipped) {
          warmup = await runWarmup(loaded, onProgress);
        }

        logger.info('Demo seeded via API (stream)', { provider: summary.provider, skipped: summary.skipped, warmup });
        emit({ type: 'complete', data: { action: 'seed', ...summary, warmup } });
        safeEnqueue(encoder.encode('data: [DONE]\n\n'));
        safeClose();
      } catch (e) {
        logger.error('setup-demo stream failed', e as Error);
        emit({ type: 'error', error: (e as Error).message });
        safeEnqueue(encoder.encode('data: [DONE]\n\n'));
        safeClose();
      }
    },
    cancel() {
      // Client disconnected before the stream finished — flag it so the
      // in-flight seedDemo/runWarmup stop pushing events. The work itself
      // continues in the background (warm-up is fire-and-forget).
      closed = true;
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
