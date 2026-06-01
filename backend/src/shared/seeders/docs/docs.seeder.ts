// src/shared/seeders/docs/docs.seeder.ts

/**
 * Docs seeder — turns the end-user markdown in src/content/docs into a working
 * "Help Assistant": Interakt answering questions about Interakt, using its own
 * pipeline.
 *
 * Creates, idempotently and in dependency order:
 *   file_store data source → ingest+embed docs → search tool → chat experience
 *
 * Unlike the demo, this runs on EVERY deployment (the help assistant is a
 * permanent feature, not sample data). It is gated on a system default
 * embedding model existing — i.e. an AI provider must be configured first.
 *
 * Re-running is safe: a content checksum skips unchanged docs; on change it
 * wipes and re-ingests. resetDocs() tears it down.
 */

import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { eq } from 'drizzle-orm';

import type { DocsSeedProgressEvent } from './docs-steps';

import { db } from '@/db/index';
import { SEED_TYPES } from '@/db/schema/seed-registry.schema';
import { user } from '@/db/schema/users.schema';
import {
  createAIExperience,
  getAIExperienceBySlug,
  updateAIExperience,
  deleteAIExperience,
} from '@/features/ai-experience/ai-experience.service';
import { getResolvedDefaults } from '@/features/ai-providers/ai-providers.service';
import {
  createDataSource,
  getDataSourceBySlug,
  deleteDataSource,
} from '@/features/data-source/data-source.service';
import {
  uploadDocument,
  listDocuments,
  deleteDocument,
} from '@/features/knowledge-base/knowledge-base.service';
import {
  createToolsForDataSource,
  getToolsByDataSourceId,
  deleteTool,
} from '@/features/tools/tools.service';
import { deriveTitle, stripFrontmatter } from '@/shared/help/markdown';
import { createLogger } from '@/shared/logger/logger';
import {
  calculateChecksum,
  upsertRegistryEntry,
  getRegistryEntry,
  deleteRegistryEntry,
} from '@/shared/seeders/seed-registry.service';

const logger = createLogger('docs-seeder');

// ---------------------------------------------------------------------------
// Constants — fixed identities for the docs resources
// ---------------------------------------------------------------------------

const DOCS_KEY = 'interakt-docs';
const DATA_SOURCE_NAME = 'Interakt Docs';
const DATA_SOURCE_SLUG = 'interakt-docs';
const EXPERIENCE_NAME = 'Help Assistant';
export const HELP_EXPERIENCE_SLUG = 'help-assistant';

/** Where the end-user docs live (read at runtime from the Node cwd). */
const DOCS_ROOT = path.resolve(process.cwd(), 'src', 'content', 'docs');

/** knowledge_chunks.embedding is a hard-coded vector(1536) — ingestion needs a matching model. */
const REQUIRED_EMBEDDING_DIMS = 1536;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocsSeedOptions {
  /** Re-ingest even if the content checksum is unchanged. */
  force?: boolean;
  /** Live step progress for the setup UI. */
  onProgress?: (event: DocsSeedProgressEvent) => void;
}

export interface DocsSeedSummary {
  skipped: boolean;
  reason?: string;
  dataSourceId?: string;
  documents?: number;
  chunks?: number;
  toolId?: string;
  experienceSlug?: string;
}

interface DocFile {
  /** Slug-ish relative path without extension, e.g. "guides/add-tools-to-your-chat". */
  slug: string;
  /** Human title (first H1, falling back to the slug). Used as the document name. */
  title: string;
  /** Markdown body with frontmatter stripped. */
  content: string;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function seedDocs(options: DocsSeedOptions = {}): Promise<DocsSeedSummary> {
  const emit = (e: DocsSeedProgressEvent) => options.onProgress?.(e);
  const adminId = await getAdminUserId();

  // Prerequisite: a system default embedding model with the right vector size.
  const defaults = await getResolvedDefaults();
  const embedding = defaults.embedding;
  if (!embedding.providerId || !embedding.modelId) {
    throw new Error(
      'No system default embedding model is configured. Configure an AI provider and set ' +
        'system defaults first — the Help Assistant needs it to embed the docs.',
    );
  }
  if (embedding.dimensions && embedding.dimensions !== REQUIRED_EMBEDDING_DIMS) {
    throw new Error(
      `The system default embedding model ("${embedding.modelKey ?? embedding.modelId}") produces ` +
        `${embedding.dimensions}-dim vectors, but the knowledge base requires ${REQUIRED_EMBEDDING_DIMS}-dim ` +
        `(e.g. OpenAI text-embedding-3-small). Pick a ${REQUIRED_EMBEDDING_DIMS}-dim embedding model, then retry.`,
    );
  }

  // Read the docs from disk and compute an idempotency checksum.
  const docs = await readDocs();
  if (docs.length === 0) {
    throw new Error(`No documentation found at ${DOCS_ROOT}.`);
  }
  const checksum = calculateChecksum({
    docs: docs.map((d) => ({ slug: d.slug, content: d.content })),
    embeddingModelId: embedding.modelId,
  });

  const existing = await getRegistryEntry(SEED_TYPES.DOCS, DOCS_KEY);
  if (existing && existing.checksum === checksum && !options.force) {
    logger.info('Docs already seeded and unchanged — skipping');
    return { skipped: true, reason: 'unchanged (use force to re-run)' };
  }

  logger.info('📚 Seeding docs Help Assistant', { docs: docs.length, embedding: embedding.modelKey });

  // 1. Data source (file_store)
  emit({ step: 'datasource', status: 'start' });
  const dataSourceId = await ensureDataSource(embedding.providerId, embedding.modelId, adminId);
  emit({ step: 'datasource', status: 'done', detail: DATA_SOURCE_SLUG });

  // 2. Ingest + embed (wipe-and-reload for a clean, idempotent state)
  emit({ step: 'ingest', status: 'start', detail: `${docs.length} docs` });
  const { chunks } = await ingestDocs(dataSourceId, docs);
  emit({ step: 'ingest', status: 'done', detail: `${docs.length} docs · ${chunks} chunks` });

  // 3. Search tool
  emit({ step: 'tool', status: 'start' });
  const toolId = await ensureSearchTool(dataSourceId, adminId);
  emit({ step: 'tool', status: 'done' });

  // 4. Help Assistant chat experience
  emit({ step: 'experience', status: 'start' });
  const experienceSlug = await ensureExperience(toolId, adminId);
  emit({ step: 'experience', status: 'done', detail: `/${experienceSlug}` });

  await upsertRegistryEntry(SEED_TYPES.DOCS, DOCS_KEY, checksum, {
    dataSourceId,
    experienceSlug,
    documents: docs.length,
    chunks,
    seededAt: new Date().toISOString(),
  });

  logger.info('✅ Docs seed complete', { dataSourceId, experienceSlug, docs: docs.length, chunks });
  return { skipped: false, dataSourceId, documents: docs.length, chunks, toolId, experienceSlug };
}

// ---------------------------------------------------------------------------
// Step 1 — file_store data source
// ---------------------------------------------------------------------------

async function ensureDataSource(
  embeddingProviderId: string,
  embeddingModelId: number,
  adminId: string,
): Promise<string> {
  const existing = await getDataSourceBySlug(DATA_SOURCE_SLUG);
  if (existing) {
    logger.info('Docs data source exists — reusing', { id: existing.id });
    return existing.id;
  }

  const input = {
    type: 'file_store' as const,
    name: DATA_SOURCE_NAME,
    slug: DATA_SOURCE_SLUG,
    description: "Interakt's own product documentation, used by the in-app Help Assistant.",
    config: {
      chunkingStrategy: 'paragraph' as const,
      chunkSize: 500,
      chunkOverlap: 50,
      embeddingProviderId,
      embeddingModelId,
      maxFileSizeMb: 50,
      maxTotalStorageMb: 1000,
      allowedFileTypes: ['md', 'txt'],
      extractMetadata: true,
      extractTables: false,
    },
  };
  const created = await createDataSource(input as Parameters<typeof createDataSource>[0], adminId);
  logger.info('Created docs data source', { id: created.id });
  return created.id;
}

// ---------------------------------------------------------------------------
// Step 2 — ingest + embed (wipe and reload)
// ---------------------------------------------------------------------------

async function ingestDocs(dataSourceId: string, docs: DocFile[]): Promise<{ chunks: number }> {
  // Clear any previously-ingested docs so re-runs don't duplicate chunks.
  const existing = await listDocuments(dataSourceId);
  for (const doc of existing) {
    await deleteDocument(doc.id).catch((e) =>
      logger.warn('Could not delete stale doc (non-fatal)', { id: doc.id, error: (e as Error).message }),
    );
  }

  let chunks = 0;
  let failed = 0;
  for (const doc of docs) {
    // Name the document with the slug (e.g. "concepts/tools") rather than the
    // H1 title. The Help Assistant uses `documentName` from search results as
    // the canonical URL path when emitting citations — so storing the slug
    // here is what makes `/docs/<slug>` links work end-to-end. The title is
    // also embedded in the chunk content (the first H1) for human-readable
    // references in answers.
    const result = await uploadDocument({
      dataSourceId,
      name: doc.slug,
      content: doc.content,
      mimeType: 'text/markdown',
    });
    if (result.document.status === 'failed') {
      failed++;
      logger.warn('Doc failed to ingest', { slug: doc.slug });
    }
    chunks += result.chunkCount;
  }

  if (failed > 0) logger.warn('Some docs failed to ingest', { failed, total: docs.length });
  logger.info('Ingested docs', { total: docs.length, chunks, failed });
  return { chunks };
}

// ---------------------------------------------------------------------------
// Step 3 — search tool
// ---------------------------------------------------------------------------

async function ensureSearchTool(dataSourceId: string, adminId: string): Promise<string> {
  let tools = await getToolsByDataSourceId(dataSourceId);
  if (tools.length === 0) {
    tools = await createToolsForDataSource(
      dataSourceId,
      DATA_SOURCE_NAME,
      DATA_SOURCE_SLUG,
      'file_store',
      null,
      adminId,
    );
    logger.info('Scaffolded docs tools', { operations: tools.map((t) => t.operation) });
  }
  const search = tools.find((t) => t.operation === 'search') ?? tools[0];
  if (!search) throw new Error('No search tool could be created for the docs data source.');
  return search.id;
}

// ---------------------------------------------------------------------------
// Step 4 — Help Assistant chat experience
// ---------------------------------------------------------------------------

async function ensureExperience(toolId: string, adminId: string): Promise<string> {
  const systemInstructions =
    'You are the Interakt Help Assistant. You help users of the Interakt platform understand how to ' +
    'configure and use its features (search indexes, data sources, tools, chat/search experiences, AI ' +
    'providers, guardrails, and more).\n\n' +
    'Always answer using the documentation search tool. Ground every answer in the retrieved docs. If ' +
    'the docs do not cover the question, say so plainly and suggest where the user might look — do not ' +
    'invent features or settings. Be concise and walk through steps in order when explaining how to do ' +
    'something.\n\n' +
    '## Citing sources\n' +
    'Each search result has a `documentName` field — that is the URL slug of the doc inside the ' +
    'documentation site (for example `concepts/tools` or `guides/create-a-search-index`). When you ' +
    'reference a doc in your answer, format it as a markdown link to `/docs/<documentName>` using a ' +
    'short, human-readable label.\n\n' +
    'Examples (assume the result has `documentName: "concepts/tools"`):\n' +
    '  - Good: See the [Tools](/docs/concepts/tools) doc for details.\n' +
    '  - Good: Follow the [Create a search index](/docs/guides/create-a-search-index) guide.\n' +
    '  - Bad:  See the [Tools](efd4f655-8f12-4d0d-8314-e376191a9460) doc. (UUID — never do this)\n' +
    '  - Bad:  See [Tools](Tools). (not a URL)\n\n' +
    'Never use the chunk `id`, `documentId`, or any UUID as the link target. Never link to anything ' +
    'except `/docs/<documentName>` paths or full external URLs.';

  const personaConfig = {
    name: 'Interakt Help',
    tone: 'friendly' as const,
    systemInstructions,
    focusAreas: ['product documentation', 'how-to guidance', 'platform configuration'],
    responseFormats: {
      enabledPresets: ['summary_with_sources', 'rich_text'] as const,
      defaultPreset: 'summary_with_sources' as const,
      enableCitations: true,
      citationStyle: 'inline' as const,
    },
  };

  // Reapply the prompt + tool wiring on every rebuild so prompt updates in
  // this seeder take effect without requiring a reset. We update an existing
  // experience in place rather than reusing-as-is.
  const existing = await getAIExperienceBySlug(HELP_EXPERIENCE_SLUG).catch(() => null);
  if (existing) {
    await updateAIExperience(
      existing.id,
      { personaConfig, toolIds: [toolId] } as unknown as Parameters<typeof updateAIExperience>[1],
      adminId,
    );
    logger.info('Help Assistant experience exists — updated prompt & tool', { slug: existing.slug });
    return existing.slug;
  }

  const blockMsg = 'Your message was blocked by content policy.';
  const input = {
    name: EXPERIENCE_NAME,
    slug: HELP_EXPERIENCE_SLUG,
    description: "Answers questions about using Interakt, grounded in the product documentation.",
    icon: 'book-open',
    pipelineMode: 'deterministic' as const,
    personaConfig,
    // Input gate disabled: legitimate "how do I…" questions must not be blocked.
    guardrailConfig: {
      inputGuardrail: { enabled: false, rules: [], onBlock: { message: blockMsg } },
      outputGuardrail: { enabled: false, rules: [], onBlock: { message: blockMsg } },
    },
    sessionConfig: {},
    accessConfig: {
      allowedOrigins: [],
      rateLimits: { chatPerMinute: 60, requestsPerDay: 10_000 },
    },
    observabilityConfig: {},
    // providerId/modelId omitted → system default chat model.
    toolIds: [toolId],
  };
  const created = await createAIExperience(
    input as unknown as Parameters<typeof createAIExperience>[0],
    adminId,
  );
  logger.info('Created Help Assistant experience', { slug: created.slug });
  return created.slug;
}

// ---------------------------------------------------------------------------
// Status — used by the Initial Setup page to show readiness and gate the build
// ---------------------------------------------------------------------------

export interface DocsSeedStatus {
  /** Whether the docs assistant has been seeded at least once. */
  seeded: boolean;
  seededAt: string | null;
  documents: number | null;
  experienceSlug: string;
  /** The embedding prerequisite (a configured, correctly-sized default model). */
  embedding: {
    configured: boolean;
    dimensions: number | null;
    modelKey: string | null;
    /** False when a default exists but its vector size doesn't match the KB column. */
    dimensionsOk: boolean;
    reason: string | null;
  };
  /** True when the docs assistant can be (re)built right now. */
  ready: boolean;
}

export async function getDocsSeedStatus(): Promise<DocsSeedStatus> {
  const entry = await getRegistryEntry(SEED_TYPES.DOCS, DOCS_KEY);
  const meta = entry?.metadata as { seededAt?: string; documents?: number } | undefined;

  const { embedding } = await getResolvedDefaults();
  const configured = !!embedding.providerId && !!embedding.modelId;
  const dimensionsOk = !embedding.dimensions || embedding.dimensions === REQUIRED_EMBEDDING_DIMS;
  let reason: string | null = null;
  if (!configured) reason = 'No system default embedding model is configured.';
  else if (!dimensionsOk) {
    reason = `Default embedding model is ${embedding.dimensions}-dim; the knowledge base needs ${REQUIRED_EMBEDDING_DIMS}-dim.`;
  }

  return {
    seeded: !!entry,
    seededAt: meta?.seededAt ?? null,
    documents: meta?.documents ?? null,
    experienceSlug: HELP_EXPERIENCE_SLUG,
    embedding: {
      configured,
      dimensions: embedding.dimensions ?? null,
      modelKey: embedding.modelKey ?? null,
      dimensionsOk,
      reason,
    },
    ready: configured && dimensionsOk,
  };
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

export interface DocsResetSummary {
  deleted: string[];
}

export async function resetDocs(): Promise<DocsResetSummary> {
  const adminId = await getAdminUserId().catch(() => 'system');
  const deleted: string[] = [];
  const tryStep = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      deleted.push(label);
    } catch (e) {
      logger.warn(`Could not delete ${label} (non-fatal)`, { error: (e as Error).message });
    }
  };

  const exp = await getAIExperienceBySlug(HELP_EXPERIENCE_SLUG).catch(() => null);
  if (exp) await tryStep(`experience ${HELP_EXPERIENCE_SLUG}`, () => deleteAIExperience(exp.id, adminId));

  const ds = await getDataSourceBySlug(DATA_SOURCE_SLUG).catch(() => null);
  if (ds) {
    const tools = await getToolsByDataSourceId(ds.id).catch(() => []);
    for (const t of tools) await tryStep(`tool ${t.slug}`, () => deleteTool(t.id, adminId));
    const docs = await listDocuments(ds.id).catch(() => []);
    for (const d of docs) await tryStep(`doc ${d.name}`, () => deleteDocument(d.id));
    await tryStep(`data source ${DATA_SOURCE_SLUG}`, () => deleteDataSource(ds.id, adminId));
  }

  await tryStep('seed-registry entry', () => deleteRegistryEntry(SEED_TYPES.DOCS, DOCS_KEY));
  return { deleted };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively read every .md under DOCS_ROOT, frontmatter-stripped. */
async function readDocs(): Promise<DocFile[]> {
  const entries = await fs.readdir(DOCS_ROOT, { recursive: true, withFileTypes: true });
  const docs: DocFile[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const dir = (entry as unknown as { parentPath?: string; path?: string }).parentPath
      ?? (entry as unknown as { path?: string }).path
      ?? DOCS_ROOT;
    const full = path.join(dir, entry.name);
    const raw = await fs.readFile(full, 'utf8');
    const content = stripFrontmatter(raw).trim();
    if (!content) continue;
    const slug = path.relative(DOCS_ROOT, full).replace(/\\/g, '/').replace(/\.md$/i, '');
    const title = deriveTitle(content) ?? slug;
    docs.push({ slug, title, content });
  }

  // Stable order so the checksum is deterministic.
  docs.sort((a, b) => a.slug.localeCompare(b.slug));
  return docs;
}

async function getAdminUserId(): Promise<string> {
  const admin = await db.query.user.findFirst({ where: eq(user.role, 'admin') });
  if (!admin) {
    throw new Error('No admin user found. An admin user is required to seed the docs Help Assistant.');
  }
  return admin.id;
}
