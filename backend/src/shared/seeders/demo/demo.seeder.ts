// src/shared/seeders/demo/demo.seeder.ts

/**
 * Demo seeder — turns demo.manifest.yaml into a fully configured demo.
 *
 * Creates, in dependency order and idempotently:
 *   provider+defaults → index → fields → documents → data source → tools
 *   → search experience → chat experience
 *
 * Every step is get-or-create: re-running is safe and reports "exists" instead
 * of erroring. Use resetDemo() (or `npm run setup:demo:reset`) for a clean
 * rebuild.
 */

import 'server-only';
import { eq } from 'drizzle-orm';

import type { DemoProviderOption, LoadedDemoManifest, MappingFieldEntry } from './demo-manifest';
import type { SeedProgressEvent } from './demo-steps';

import { db } from '@/db/index';
import { SEED_TYPES } from '@/db/schema/seed-registry.schema';
import { user } from '@/db/schema/users.schema';
import { createAIExperience, getAIExperienceBySlug, deleteAIExperience } from '@/features/ai-experience/ai-experience.service';
import { getModelByProviderAndKey } from '@/features/ai-providers/ai-providers.repository';
import { createModel, getProviderByKey, updateProvider, updateSystemDefaults } from '@/features/ai-providers/ai-providers.service';
import {
  createDataSource,
  getDataSourceBySlug,
  performHealthCheck,
  deleteDataSource,
} from '@/features/data-source/data-source.service';
import { indexDocuments } from '@/features/document-indexing/document-indexer.service';
import { getSearchEngineProvider } from '@/features/search/providers';
import {
  createSearchExperience,
  getSearchExperienceBySlug,
  deleteSearchExperience,
} from '@/features/search-experience/search-experience.service';
import {
  getFieldsBySearchIndexId,
  createFieldsFromMappingEntries,
  updateFieldMappingConfig,
  updateField,
  type MappingEntryInput,
} from '@/features/search-index/search-index-fields.service';
import { createSearchIndex, getSearchIndexByName, deleteSearchIndex } from '@/features/search-index/search-index.service';
import { createToolsForDataSource, getToolsByDataSourceId, updateTool, deleteTool } from '@/features/tools/tools.service';
import { createLogger } from '@/shared/logger/logger';
import {
  calculateChecksum,
  upsertRegistryEntry,
  getRegistryEntry,
  deleteRegistryEntry,
} from '@/shared/seeders/seed-registry.service';


const logger = createLogger('demo-seeder');

export interface DemoSeedOptions {
  /** Re-create even if the seed-registry checksum is unchanged. */
  force?: boolean;
  /** Which provider option to use (manifest.provider.options key). Defaults to recommended. */
  provider?: string;
  /** API key for a cloud provider (openai). Ignored for keyless providers. */
  apiKey?: string;
  /** Base URL for a local provider (ollama). Falls back to the manifest default. */
  baseUrl?: string;
  /**
   * Chat model to use (model_key), chosen by the admin on the Demo Setup page.
   * Falls back to the provider option's manifest default when omitted. The text
   * model always follows the chat model.
   */
  chatModel?: string;
  /**
   * Embedding model to use (model_key), chosen by the admin. Falls back to the
   * manifest default. Changing it to a model with a different vector size needs
   * a reset first (the index's dimensions are fixed at build time).
   */
  embeddingModel?: string;
  /** Called as each step starts/finishes so callers can stream live progress. */
  onProgress?: (event: SeedProgressEvent) => void;
}

export interface DemoSeedSummary {
  skipped: boolean;
  reason?: string;
  adminEmail?: string;
  provider?: string;
  index?: { id: string; name: string; documents: number; embeddings: number };
  dataSourceId?: string;
  toolIds?: string[];
  searchExperience?: { slug: string; accessToken: string };
  chatExperience?: { slug: string; accessToken: string };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function seedDemo(loaded: LoadedDemoManifest, options: DemoSeedOptions = {}): Promise<DemoSeedSummary> {
  const { manifest, mapping, documents } = loaded;

  // Resolve the chosen provider option (defaults to the manifest's recommended).
  const providerKey = options.provider ?? manifest.provider.recommended;
  const providerOption = manifest.provider.options[providerKey];
  if (!providerOption) {
    throw new Error(
      `Unknown provider "${providerKey}". Available: ${Object.keys(manifest.provider.options).join(', ')}.`,
    );
  }

  // The chat and embedding models are both admin-selectable on the Demo Setup
  // page; fall back to the manifest defaults. The embedding model's vector size
  // is fixed in the index at build time, so resolve the chosen model's
  // dimensions (from the catalog) up front to fail fast on a size change.
  const chatModel = options.chatModel?.trim() || providerOption.defaults.chatModel;
  const embeddingModel = options.embeddingModel?.trim() || providerOption.defaults.embeddingModel;
  const effectiveEmbeddingDimensions = await resolveEmbeddingDimensions(
    providerKey,
    embeddingModel,
    providerOption.embeddingDimensions,
  );

  // Provider, chat + embedding model are part of the checksum: changing any of
  // them must re-run setup (a new embedding model may even rebuild the index).
  const checksum = calculateChecksum({
    manifest,
    provider: providerKey,
    chatModel,
    embeddingModel,
    fields: mapping.fields.length,
    docs: documents.length,
  });

  // No-op when no listener is attached, so non-streaming callers are unaffected.
  const emit = (event: SeedProgressEvent) => options.onProgress?.(event);

  // Fast idempotency: unchanged checksum + not forced → skip.
  const existingEntry = await getRegistryEntry(SEED_TYPES.DEMO, manifest.demo.key);
  if (existingEntry && existingEntry.checksum === checksum && !options.force) {
    logger.info('Demo already seeded and unchanged — skipping', { key: manifest.demo.key });
    return { skipped: true, reason: 'unchanged (use --force to re-run)' };
  }

  // Fail fast on a provider switch BEFORE mutating the provider or system
  // defaults: an existing index's embedding size can't change in place, so the
  // user must reset first. (The page usually pre-gates this, but this also
  // covers legacy demos seeded before provider tracking existed.)
  if (effectiveEmbeddingDimensions) {
    const existingIndex = await getSearchIndexByName(manifest.index.name).catch(() => null);
    const existingDims = (existingIndex as { embeddingDimensions?: number | null } | null)?.embeddingDimensions;
    if (existingDims && existingDims !== effectiveEmbeddingDimensions) {
      throw new Error(
        `The demo index already exists with ${existingDims}-dim embeddings, but "${embeddingModel}" produces ` +
          `${effectiveEmbeddingDimensions}-dim. Reset the demo first, then set it up with "${embeddingModel}".`,
      );
    }
  }

  const adminId = await getAdminUserId();
  const admin = await db.query.user.findFirst({ where: eq(user.role, 'admin') });

  logger.info('🌱 Seeding demo', { name: manifest.demo.name, provider: providerKey, admin: admin?.email });

  // 1. Provider + system defaults
  emit({ step: 'provider', status: 'start' });
  const { providerId, embeddingModelId, embeddingDimensions } = await seedProvider(providerOption, {
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    chatModel,
    embeddingModel,
  });
  emit({ step: 'provider', status: 'done', detail: `${providerOption.label}: ${chatModel} · ${providerOption.defaults.embeddingModel}` });

  // 2. Index + 3. fields + 4. documents
  const index = await seedIndexWithDocs(loaded, { providerId, embeddingModelId, embeddingDimensions }, adminId, emit);

  // 5. Data source + tools
  emit({ step: 'tools', status: 'start' });
  const { dataSourceId, toolIds } = await seedDataSourceAndTools(manifest, index.id, adminId);
  emit({ step: 'tools', status: 'done', detail: `${toolIds.length} tools` });

  // 6. Search experience
  emit({ step: 'search', status: 'start' });
  const searchExp = await seedSearchExperience(manifest, index.id, adminId);
  emit({ step: 'search', status: 'done', detail: `/${searchExp.slug}` });

  // 7. Chat experience
  emit({ step: 'chat', status: 'start' });
  const chatExp = await seedChatExperience(manifest, dataSourceId, adminId);
  emit({ step: 'chat', status: 'done', detail: `/${chatExp.slug}` });

  await upsertRegistryEntry(SEED_TYPES.DEMO, manifest.demo.key, checksum, {
    provider: providerKey,
    indexId: index.id,
    dataSourceId,
    searchExperienceSlug: searchExp.slug,
    chatExperienceSlug: chatExp.slug,
    seededAt: new Date().toISOString(),
  });

  logger.info('✅ Demo seed complete', { provider: providerKey, index: index.name, search: searchExp.slug, chat: chatExp.slug });

  return {
    skipped: false,
    adminEmail: admin?.email,
    provider: providerKey,
    index: { id: index.id, name: index.name, documents: index.documents, embeddings: index.embeddings },
    dataSourceId,
    toolIds,
    searchExperience: searchExp,
    chatExperience: chatExp,
  };
}

// ---------------------------------------------------------------------------
// Step 1 — provider + defaults
// ---------------------------------------------------------------------------

/**
 * The vector size of an embedding model, looked up from the catalog (which
 * stores dimensions per model). Falls back to the manifest option's default
 * dimensions when the model isn't catalogued yet. Used to fail fast when the
 * admin picks an embedding model whose size differs from the existing index.
 */
async function resolveEmbeddingDimensions(
  providerKey: string,
  embeddingModelKey: string,
  fallback?: number,
): Promise<number | undefined> {
  const provider = await getProviderByKey(providerKey).catch(() => null);
  if (provider) {
    const model = await getModelByProviderAndKey(provider.id, embeddingModelKey).catch(() => null);
    const dims = (model as { dimensions?: number | null } | null)?.dimensions;
    if (dims) return dims;
  }
  return fallback;
}

async function seedProvider(
  option: DemoProviderOption,
  creds: { apiKey?: string; baseUrl?: string; chatModel?: string; embeddingModel?: string },
) {
  const { key, authType, defaults } = option;

  const provider = await getProviderByKey(key);
  if (!provider) {
    throw new Error(
      `AI provider "${key}" is not in the catalog. The provider catalog is seeded on app boot — ` +
        `start the app once, then try again.`,
    );
  }

  // Configure auth/connection per provider type.
  if (authType === 'api_key') {
    // Use the supplied key, or keep the one already stored on the provider.
    const newKey = creds.apiKey?.trim();
    if (!newKey && !provider.hasApiKey) {
      throw new Error(
        `${option.label} needs an API key. Enter it on the Demo Setup page — hybrid search needs it to embed the catalog.`,
      );
    }
    await updateProvider(provider.id, { isEnabled: true, ...(newKey ? { apiKey: newKey } : {}) });
    logger.info('Configured cloud provider', { key, providerId: provider.id, usingNewKey: !!newKey });
  } else {
    // Local provider (e.g. ollama): no key; optionally point at a custom base URL.
    const baseUrl = creds.baseUrl?.trim() || option.defaultBaseUrl;
    await updateProvider(provider.id, { isEnabled: true, ...(baseUrl ? { baseUrl } : {}) });
    logger.info('Configured local provider', { key, providerId: provider.id, baseUrl });
  }

  // Resolve (or register) the model ids by model_key. Chat + embedding are the
  // admin's picks (falling back to the manifest defaults); the text model
  // follows the chat model so non-chat text generation uses the same LLM.
  const chatModelKey = creds.chatModel?.trim() || defaults.chatModel;
  const embeddingModelKey = creds.embeddingModel?.trim() || defaults.embeddingModel;
  const chat = await ensureModel(provider.id, key, chatModelKey, 'chat');
  const text = await ensureModel(provider.id, key, chatModelKey, 'text');
  const embedding = await ensureModel(provider.id, key, embeddingModelKey, 'embedding', option.embeddingDimensions);

  await updateSystemDefaults({
    defaultChatProviderId: provider.id,
    defaultChatModelId: chat.id,
    defaultTextProviderId: provider.id,
    defaultTextModelId: text.id,
    defaultEmbeddingProviderId: provider.id,
    defaultEmbeddingModelId: embedding.id,
  });
  logger.info('Set system defaults', { chat: chatModelKey, embedding: embeddingModelKey });

  return {
    providerId: provider.id,
    embeddingModelId: embedding.id,
    embeddingDimensions: embedding.dimensions ?? option.embeddingDimensions ?? 1536,
  };
}

/**
 * Resolve a model by key, creating its catalog record if missing. The boot
 * catalog seeder skips providers whose seed changed, so a freshly-recommended
 * model (e.g. qwen2.5:7b) may not exist on an older DB — this self-heals it.
 * For Ollama the catalog is just metadata; the real availability is whether the
 * model is pulled on the Ollama server (the page checks that separately).
 */
async function ensureModel(
  providerId: string,
  providerKey: string,
  modelKey: string,
  modelType: 'chat' | 'text' | 'embedding',
  dimensions?: number,
) {
  const existing = await getModelByProviderAndKey(providerId, modelKey);
  if (existing) return existing;

  logger.info('Registering missing model in catalog', { providerKey, modelKey, modelType });
  const created = await createModel({
    providerId,
    modelKey,
    displayName: modelKey,
    description: `Registered by demo setup for ${providerKey}.`,
    modelType,
    dimensions: modelType === 'embedding' ? (dimensions ?? null) : null,
    capabilities: modelType === 'embedding' ? {} : { supportsStreaming: true, supportsFunctionCalling: true },
    isAvailable: true,
    isDiscovered: false,
    sortOrder: 0,
  });
  // createModel returns a response DTO; re-read to get the persisted row shape.
  return (await getModelByProviderAndKey(providerId, modelKey)) ?? { id: created.id, dimensions: created.dimensions ?? null };
}

// ---------------------------------------------------------------------------
// Steps 2-4 — index, fields, documents
// ---------------------------------------------------------------------------

async function seedIndexWithDocs(
  loaded: LoadedDemoManifest,
  ai: { providerId: string; embeddingModelId: number; embeddingDimensions: number },
  adminId: string,
  emit: (event: SeedProgressEvent) => void = () => {},
) {
  const { manifest, mapping, documents } = loaded;
  const cfg = manifest.index;

  emit({ step: 'index', status: 'start' });
  let indexRecord = await getSearchIndexByName(cfg.name);
  if (indexRecord) {
    // Embedding dimensions are baked into the ES mapping — you can't reuse an
    // index built for a different provider's vector size. Fail loudly so the
    // user resets first, rather than producing an index/embedding mismatch.
    const existingDims = (indexRecord as { embeddingDimensions?: number | null }).embeddingDimensions;
    if (existingDims && existingDims !== ai.embeddingDimensions) {
      throw new Error(
        `The demo index already exists with ${existingDims}-dim embeddings, but the selected provider produces ` +
          `${ai.embeddingDimensions}-dim. Reset the demo first, then set it up with the other provider.`,
      );
    }
    logger.info('Search index exists — reusing', { name: cfg.name, id: indexRecord.id });
  } else {
    const input: Parameters<typeof createSearchIndex>[0] = {
      name: cfg.name,
      displayName: cfg.displayName,
      description: cfg.description,
      searchType: cfg.searchType,
      searchProvider: cfg.searchProvider,
      indexingStrategy: cfg.indexingStrategy,
      language: cfg.language,
      synonyms: cfg.synonyms,
      stopWords: cfg.stopWords,
      vectorSimilarity: cfg.vectorSimilarity,
      rrfRankConstant: cfg.rrfRankConstant,
      rrfWindowSize: cfg.rrfWindowSize,
      numberOfShards: cfg.numberOfShards,
      numberOfReplicas: cfg.numberOfReplicas,
      refreshInterval: cfg.refreshInterval,
      // Embedding config (required for hybrid). aiModelId is the EMBEDDING model.
      aiProviderId: ai.providerId,
      aiModelId: ai.embeddingModelId,
      embeddingDimensions: ai.embeddingDimensions,
    };
    indexRecord = await createSearchIndex(input, adminId);
    logger.info('Created search index', { name: cfg.name, id: indexRecord.id });
  }
  emit({ step: 'index', status: 'done', detail: `${cfg.searchType} · ${cfg.name}` });

  // Apply the golden field mappings. createSearchIndex auto-creates a few
  // default system fields (uniqueId, additionalData, customFields); update
  // those to match the manifest and create the rest.
  emit({ step: 'fields', status: 'start' });
  await applyFieldMappings(indexRecord.id, mapping.fields, adminId);
  emit({ step: 'fields', status: 'done', detail: `${mapping.fields.length} fields` });

  // Bulk-load + embed the documents. indexDocuments reads embedding config and
  // the vector-source field(s) from the index record.
  emit({ step: 'documents', status: 'start', detail: `${documents.length} products` });
  const result = await indexDocuments({
    searchIndexId: indexRecord.id,
    documents,
    sourceFileName: cfg.documentsFile,
    createdBy: adminId,
  });
  logger.info('Indexed documents', {
    total: result.totalDocuments,
    indexed: result.indexedDocuments,
    failed: result.failedDocuments,
    embeddings: result.embeddingStats?.generated ?? 0,
  });
  if (result.failedDocuments > 0) {
    logger.warn('Some documents failed to index', { failed: result.failedDocuments, sample: result.errors.slice(0, 3) });
  }
  emit({
    step: 'documents',
    status: 'done',
    detail: `${result.indexedDocuments} indexed · ${result.embeddingStats?.generated ?? 0} embeddings`,
  });

  return {
    id: indexRecord.id,
    name: indexRecord.name,
    documents: result.indexedDocuments,
    embeddings: result.embeddingStats?.generated ?? 0,
  };
}

/**
 * Reconcile the index's fields with the manifest's field-mapping export.
 * Existing fields (the auto-created system fields) are updated in place;
 * missing ones are created. Keyed by fieldName, so no hardcoded names.
 */
async function applyFieldMappings(indexId: string, mappingFields: MappingFieldEntry[], adminId: string) {
  const existing = await getFieldsBySearchIndexId(indexId);
  const byName = new Map(existing.map((f) => [f.fieldName, f]));

  const toCreate: MappingEntryInput[] = [];
  let updated = 0;

  for (const f of mappingFields) {
    const current = byName.get(f.fieldName);
    if (!current) {
      toCreate.push(f as MappingEntryInput);
      continue;
    }
    // Update the existing (system) field to match the manifest.
    await updateFieldMappingConfig(current.id, buildMappingConfig(f.mapping), adminId);
    const attrs: Parameters<typeof updateField>[1] = {
      isSearchable: f.attributes.isSearchable,
      isFacetable: f.attributes.isFacetable,
      includeInResponse: f.attributes.includeInResponse,
      boostValue: f.attributes.boostValue,
      isVectorSource: f.attributes.isVectorSource,
      isAutocomplete: f.attributes.isAutocomplete ?? false,
    };
    await updateField(current.id, attrs, adminId);
    updated++;
  }

  const { created, errors } = await createFieldsFromMappingEntries(indexId, toCreate, adminId);
  logger.info('Applied field mappings', { updated, created: created.length, errors: errors.length });
  if (errors.length) logger.warn('Some fields could not be created', { errors });
}

function buildMappingConfig(mapping: MappingFieldEntry['mapping']): Parameters<typeof updateFieldMappingConfig>[1] {
  const mc: Record<string, unknown> = {
    mode: mapping.mode,
    transform: mapping.transform ?? 'none',
  };
  if (mapping.staticValue !== undefined) mc.staticValue = mapping.staticValue;
  if (mapping.generator) mc.generator = mapping.generator;
  if (mapping.computed) mc.computed = mapping.computed;
  if (mapping.collectFields && mapping.collectFields.length) mc.collectFields = mapping.collectFields;
  if (mapping.sourceFromField) mc.sourceFromField = mapping.sourceFromField;
  return mc as unknown as Parameters<typeof updateFieldMappingConfig>[1];
}

// ---------------------------------------------------------------------------
// Step 5 — data source + tools
// ---------------------------------------------------------------------------

async function seedDataSourceAndTools(manifest: LoadedDemoManifest['manifest'], indexId: string, adminId: string) {
  const cfg = manifest.dataSource;

  let dataSource = await getDataSourceBySlug(cfg.slug);
  if (dataSource) {
    logger.info('Data source exists — reusing', { slug: cfg.slug, id: dataSource.id });
  } else {
    const input = {
      type: 'search_index' as const,
      name: cfg.name,
      slug: cfg.slug,
      config: { searchIndexId: indexId },
    };
    dataSource = await createDataSource(input as Parameters<typeof createDataSource>[0], adminId);
    logger.info('Created data source', { slug: cfg.slug, id: dataSource.id });
  }

  // Best-effort: discover the schema from the index so tool descriptions are richer.
  try {
    await performHealthCheck(dataSource.id);
  } catch (e) {
    logger.warn('Data source health check failed (non-fatal)', { error: (e as Error).message });
  }
  const refreshed = await getDataSourceBySlug(cfg.slug);
  const schema = (refreshed as { schema?: unknown } | undefined)?.schema as
    | Parameters<typeof createToolsForDataSource>[4]
    | undefined;

  let tools = await getToolsByDataSourceId(dataSource.id);
  if (tools.length === 0) {
    tools = await createToolsForDataSource(dataSource.id, cfg.name, cfg.slug, 'search_index', schema ?? null, adminId);
    logger.info('Scaffolded tools', { count: tools.length, operations: tools.map((t) => t.operation) });
  } else {
    logger.info('Tools exist — reusing', { count: tools.length });
  }

  // Give the result-returning tools a display config so chat renders visual
  // presets (cards/grids) instead of always falling back to rich_text. Set on
  // each result tool explicitly (rather than relying on data-source
  // inheritance) so re-seeding also heals tools created before this existed.
  const toolDisplayConfig = manifest.tools.displayConfig;
  if (toolDisplayConfig) {
    const RESULT_OPERATIONS = new Set(['search', 'lookup']);
    const targets = tools.filter((t) => t.operation && RESULT_OPERATIONS.has(t.operation));
    for (const t of targets) {
      await updateTool(t.id, { displayConfig: toolDisplayConfig } as Parameters<typeof updateTool>[1], adminId);
    }
    if (targets.length > 0) {
      tools = await getToolsByDataSourceId(dataSource.id); // reflect the update in the returned list
      logger.info('Applied tool display config', { tools: targets.map((t) => t.slug) });
    }
  }

  return { dataSourceId: dataSource.id, toolIds: tools.map((t) => t.id), tools };
}

// ---------------------------------------------------------------------------
// Step 6 — search experience
// ---------------------------------------------------------------------------

async function seedSearchExperience(manifest: LoadedDemoManifest['manifest'], indexId: string, adminId: string) {
  const cfg = manifest.searchExperience;

  // getSearchExperienceBySlug throws NotFoundError when absent (unlike the
  // index/data-source getters), so treat a throw as "doesn't exist".
  const existing = await getSearchExperienceBySlug(cfg.slug).catch(() => null);
  if (existing) {
    logger.info('Search experience exists — reusing', { slug: cfg.slug });
    return { slug: existing.slug, accessToken: existing.accessToken };
  }

  const aiCfg = (cfg.aiConfig ?? {}) as { enabled?: boolean; summary?: Record<string, unknown> };
  const input = {
    name: cfg.name,
    slug: cfg.slug,
    description: cfg.description,
    indexes: [{ searchIndexId: indexId, role: 'primary' as const, weight: 1, sortOrder: 0 }],
    searchConfig: cfg.searchConfig,
    aiConfig: { enabled: aiCfg.enabled ?? true, providerId: null, modelId: null, summary: aiCfg.summary },
    toolsConfig: cfg.toolsConfig,
    displayConfig: cfg.displayConfig,
    allowedOrigins: [],
  };
  const created = await createSearchExperience(input as Parameters<typeof createSearchExperience>[0], adminId);
  logger.info('Created search experience', { slug: created.slug });
  return { slug: created.slug, accessToken: created.accessToken };
}

// ---------------------------------------------------------------------------
// Step 7 — chat (AI) experience
// ---------------------------------------------------------------------------

async function seedChatExperience(manifest: LoadedDemoManifest['manifest'], dataSourceId: string, adminId: string) {
  const cfg = manifest.chatExperience;

  const existing = await getAIExperienceBySlug(cfg.slug).catch(() => null);
  if (existing) {
    logger.info('Chat experience exists — reusing', { slug: cfg.slug });
    return { slug: existing.slug, accessToken: existing.accessToken };
  }

  // Resolve enabled tool operations → tool ids for this data source.
  const tools = await getToolsByDataSourceId(dataSourceId);
  const enabledOps = new Set(cfg.tools.enabled);
  const toolIds = tools.filter((t) => t.operation && enabledOps.has(t.operation)).map((t) => t.id);

  const blockMsg = 'Your message was blocked by content policy.';
  const guard = cfg.guardrails ?? {};
  const guardrailConfig = {
    inputGuardrail: {
      enabled: guard.input?.enabled ?? false,
      rules: guard.input?.rules ?? [],
      onBlock: { message: (guard.input?.onBlock as { message?: string } | undefined)?.message ?? blockMsg },
    },
    outputGuardrail: {
      enabled: guard.output?.enabled ?? false,
      rules: guard.output?.rules ?? [],
      onBlock: { message: (guard.output?.onBlock as { message?: string } | undefined)?.message ?? blockMsg },
    },
  };

  const access = (cfg.access ?? {}) as { allowedOrigins?: string[]; rateLimits?: Record<string, unknown>; embed?: Record<string, unknown> };
  const accessConfig = {
    allowedOrigins: access.allowedOrigins ?? [],
    rateLimits: access.rateLimits ?? { chatPerMinute: 60, requestsPerDay: 10000 },
    embedConfig: access.embed,
  };

  const input = {
    name: cfg.name,
    slug: cfg.slug,
    description: cfg.description,
    icon: cfg.icon,
    pipelineMode: cfg.pipelineMode,
    personaConfig: cfg.persona,
    guardrailConfig,
    sessionConfig: cfg.session ?? {},
    accessConfig,
    observabilityConfig: cfg.observability ?? {},
    // providerId/modelId omitted → falls back to system defaults.
    toolIds,
  };
  const created = await createAIExperience(input as Parameters<typeof createAIExperience>[0], adminId);
  logger.info('Created chat experience', { slug: created.slug, tools: toolIds.length });
  return { slug: created.slug, accessToken: created.accessToken };
}

// ---------------------------------------------------------------------------
// Admin lookup
// ---------------------------------------------------------------------------

async function getAdminUserId(): Promise<string> {
  const admin = await db.query.user.findFirst({ where: eq(user.role, 'admin') });
  if (!admin) {
    throw new Error(
      'No admin user found. setup:demo seeds the admin from setup/setup.config.yaml — ' +
        'copy setup.config.example.yaml → setup.config.yaml and set an email + password first.',
    );
  }
  return admin.id;
}

// ---------------------------------------------------------------------------
// Reset — tear the demo down for a clean rebuild
// ---------------------------------------------------------------------------

export interface DemoResetSummary {
  deleted: string[];
}

/**
 * Delete everything the demo created, in reverse dependency order, then drop
 * the physical Elasticsearch index (which deleteSearchIndex does NOT do) and
 * clear the seed-registry entry. Each step is best-effort so a partial state
 * still cleans up. Provider/system-defaults are intentionally left intact.
 */
export async function resetDemo(loaded: LoadedDemoManifest): Promise<DemoResetSummary> {
  const { manifest } = loaded;
  const adminId = await getAdminUserId().catch(() => 'system');
  const deleted: string[] = [];

  const tryStep = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      deleted.push(label);
      logger.info('Deleted', { what: label });
    } catch (e) {
      logger.warn(`Could not delete ${label} (non-fatal)`, { error: (e as Error).message });
    }
  };

  // Chat experience (removes ai_experience_tools links first).
  const chat = await getAIExperienceBySlug(manifest.chatExperience.slug).catch(() => null);
  if (chat) await tryStep(`chat experience ${manifest.chatExperience.slug}`, () => deleteAIExperience(chat.id, adminId));

  // Search experience (cascades search_experience_indexes).
  const search = await getSearchExperienceBySlug(manifest.searchExperience.slug).catch(() => null);
  if (search) await tryStep(`search experience ${manifest.searchExperience.slug}`, () => deleteSearchExperience(search.id, adminId));

  // Data source + its scaffolded tools.
  const ds = await getDataSourceBySlug(manifest.dataSource.slug).catch(() => null);
  if (ds) {
    const tools = await getToolsByDataSourceId(ds.id).catch(() => []);
    for (const t of tools) await tryStep(`tool ${t.slug}`, () => deleteTool(t.id, adminId));
    await tryStep(`data source ${manifest.dataSource.slug}`, () => deleteDataSource(ds.id, adminId));
  }

  // Search index (DB record + fields), then the physical ES index.
  const index = await getSearchIndexByName(manifest.index.name).catch(() => null);
  if (index) {
    await tryStep(`search index ${manifest.index.name} (db)`, () => deleteSearchIndex(index.id, adminId));
    await tryStep(`elasticsearch index ${manifest.index.name}`, async () => {
      const provider = getSearchEngineProvider(manifest.index.searchProvider);
      await provider.deleteIndex(manifest.index.name);
    });
  }

  await tryStep('seed-registry entry', () => deleteRegistryEntry(SEED_TYPES.DEMO, manifest.demo.key));

  return { deleted };
}
