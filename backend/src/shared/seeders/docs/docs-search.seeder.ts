// src/shared/seeders/docs/docs-search.seeder.ts

/**
 * Docs search seeder — builds the in-app docs search on Interakt's own search
 * stack: a search index of the end-user docs (one record per section) and a
 * search experience over it. The /docs search dialog and the help drawer's
 * Search tab call that experience.
 *
 * Unlike the Help Assistant it needs no AI provider: the index goes into the
 * deployment's search engine (SEARCH_PROVIDER) as keyword-only search, and is
 * rebuilt as hybrid once a system default embedding model exists. It runs at
 * startup (so search works on a fresh install) and as the first step of the
 * Help Assistant build (so it turns hybrid without a restart).
 *
 * Re-running is safe: a checksum over the records and the search mode skips
 * unchanged runs. Changed docs reload the existing index in place; a changed
 * search mode, embedding model or schema recreates the index and experience.
 * Both are managed resources — edits made to them in the admin are replaced
 * on the next rebuild.
 */

import 'server-only';
import { sql } from 'drizzle-orm';

import { buildDocsSearchRecords, type DocsSearchRecord } from './docs-search-records';
import { getAdminUserId, readDocs } from './docs-source';

import { db } from '@/db/index';
import { SEED_TYPES } from '@/db/schema/seed-registry.schema';
import { getResolvedDefaults } from '@/features/ai-providers/ai-providers.service';
import { indexDocuments } from '@/features/document-indexing/document-indexer.service';
import {
  createSearchExperience,
  deleteSearchExperience,
  getSearchExperienceBySlug,
} from '@/features/search-experience/search-experience.service';
import {
  createFieldsFromMappingEntries,
  getFieldsBySearchIndexId,
  updateField,
  type MappingEntryInput,
} from '@/features/search-index/search-index-fields.service';
import {
  createSearchIndex,
  deleteSearchIndex,
  getSearchIndexByName,
  recreateEmptyIndex,
} from '@/features/search-index/search-index.service';
import { DOCS_SEARCH_SLUG } from '@/shared/help/help-content';
import { createLogger } from '@/shared/logger/logger';
import { calculateChecksum, getRegistryEntry, upsertRegistryEntry } from '@/shared/seeders/seed-registry.service';

const logger = createLogger('docs-search-seeder');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEARCH_KEY = 'interakt-docs-search';
/** The index shares the experience's slug; valid for both Elasticsearch and Azure AI Search. */
const INDEX_NAME = DOCS_SEARCH_SLUG;
/** Bump when the fields or experience config below change — forces a full recreate. */
const SCHEMA_VERSION = 1;
/** Arbitrary, fixed key for the Postgres advisory lock that keeps replicas from building at once. */
const LOCK_KEY = 72_001;

/** Fields beyond the auto-created system ones. Boosts: page title > section heading > body. */
const FIELDS: MappingEntryInput[] = [
  textField('docTitle', 'Page', 5),
  textField('section', 'Section', 3),
  textField('content', 'Content', 1),
  keywordField('group', 'Group', { facetable: true }),
  keywordField('slug', 'Slug'),
  keywordField('anchor', 'Anchor'),
  { ...keywordField('url', 'URL'), fieldType: 'url' },
];

function textField(fieldName: string, displayName: string, boostValue: number): MappingEntryInput {
  return {
    fieldName,
    fieldType: 'text',
    displayName,
    mapping: { mode: 'source', sourceField: fieldName },
    attributes: { isSearchable: true, isFacetable: false, includeInResponse: true, boostValue, isVectorSource: true },
  };
}

function keywordField(fieldName: string, displayName: string, opts: { facetable?: boolean } = {}): MappingEntryInput {
  return {
    fieldName,
    fieldType: 'keyword',
    displayName,
    mapping: { mode: 'source', sourceField: fieldName },
    attributes: {
      isSearchable: false,
      isFacetable: opts.facetable ?? false,
      includeInResponse: true,
      boostValue: 1,
      isVectorSource: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SearchMode =
  | { searchType: 'lexical' }
  | { searchType: 'hybrid'; providerId: string; modelId: number; dimensions: number; modelKey: string | null };

export interface DocsSearchSeedSummary {
  skipped: boolean;
  reason?: string;
  searchType?: SearchMode['searchType'];
  sections?: number;
}

interface DocsSearchMeta {
  schemaVersion: number;
  searchType: SearchMode['searchType'];
  embeddingModelKey: string | null;
  sections: number;
  seededAt: string;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function seedDocsSearch(options: { force?: boolean } = {}): Promise<DocsSearchSeedSummary> {
  // One builder at a time across replicas: the transaction holds the lock for
  // the duration of the build (the build itself runs on other connections).
  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(${LOCK_KEY}) as locked`);
    if (!row?.locked) {
      logger.info('Docs search is being built by another instance — skipping');
      return { skipped: true, reason: 'another instance is building it' };
    }
    return build(options.force ?? false);
  });
}

async function build(force: boolean): Promise<DocsSearchSeedSummary> {
  const adminId = await getAdminUserId();
  const records = buildDocsSearchRecords(await readDocs());
  if (records.length === 0) throw new Error('No documentation found to index.');

  const mode = await resolveSearchMode();
  const summary = await buildWithMode(records, mode, adminId, force);

  // Embeddings that didn't happen (bad key, provider down) would leave a hybrid
  // index whose every query fails to embed. Fall back to keyword-only rather
  // than ship broken search; the next build retries hybrid.
  if (summary === 'embeddings-failed') {
    logger.warn('Docs search embeddings failed — rebuilding as keyword-only');
    const fallback = await buildWithMode(records, { searchType: 'lexical' }, adminId, true);
    if (fallback === 'embeddings-failed') throw new Error('Docs search could not be built.');
    return fallback;
  }
  return summary;
}

async function buildWithMode(
  records: DocsSearchRecord[],
  mode: SearchMode,
  adminId: string,
  force: boolean,
): Promise<DocsSearchSeedSummary | 'embeddings-failed'> {
  const embeddingModelKey = mode.searchType === 'hybrid' ? mode.modelKey ?? String(mode.modelId) : null;
  const checksum = calculateChecksum({ schemaVersion: SCHEMA_VERSION, searchType: mode.searchType, embeddingModelKey, records });

  const entry = await getRegistryEntry(SEED_TYPES.DOCS, SEARCH_KEY);
  const meta = entry?.metadata as Partial<DocsSearchMeta> | undefined;
  let index = await getSearchIndexByName(INDEX_NAME);
  let experience = await getSearchExperienceBySlug(DOCS_SEARCH_SLUG).catch(() => null);

  if (!force && entry?.checksum === checksum && index && experience) {
    logger.info('Docs search unchanged — skipping');
    return { skipped: true, reason: 'unchanged', searchType: mode.searchType, sections: records.length };
  }

  const recreate =
    !index ||
    meta?.schemaVersion !== SCHEMA_VERSION ||
    index.searchType !== mode.searchType ||
    (index.aiModelId ?? null) !== (mode.searchType === 'hybrid' ? mode.modelId : null);

  logger.info('🔎 Building docs search', { sections: records.length, searchType: mode.searchType, recreate });

  if (recreate) {
    // The experience references the index, so it goes first.
    if (experience) await deleteSearchExperience(experience.id, adminId);
    experience = null;
    if (index) await deleteSearchIndex(index.id, adminId);
    index = await createIndex(mode, adminId);
    await applyFields(index.id, adminId);
  } else {
    // Same shape — empty it (drops sections that no longer exist) and reload.
    const result = await recreateEmptyIndex(index!.id, adminId);
    if (!result.success) throw new Error(`Could not reset the docs search index: ${result.error}`);
  }

  const result = await indexDocuments({
    searchIndexId: index!.id,
    documents: records as unknown as Record<string, unknown>[],
    sourceFileName: 'src/content/docs',
    createdBy: adminId,
  });
  if (result.indexedDocuments === 0) {
    throw new Error(`Docs search indexed no sections: ${result.errors.slice(0, 3).map((e) => JSON.stringify(e)).join('; ')}`);
  }
  if (result.failedDocuments > 0) {
    logger.warn('Some docs sections failed to index', { failed: result.failedDocuments });
  }
  const embedded = result.embeddingStats?.generated ?? 0;
  if (mode.searchType === 'hybrid' && embedded < result.indexedDocuments / 2) return 'embeddings-failed';

  if (!experience) await createExperience(index!.id, adminId);

  const nextMeta: DocsSearchMeta = {
    schemaVersion: SCHEMA_VERSION,
    searchType: mode.searchType,
    embeddingModelKey,
    sections: result.indexedDocuments,
    seededAt: new Date().toISOString(),
  };
  await upsertRegistryEntry(SEED_TYPES.DOCS, SEARCH_KEY, checksum, nextMeta as unknown as Record<string, unknown>);

  logger.info('✅ Docs search built', { sections: result.indexedDocuments, searchType: mode.searchType, embedded });
  return { skipped: false, searchType: mode.searchType, sections: result.indexedDocuments };
}

/** Hybrid when a system default embedding model (with a known vector size) exists, keyword-only otherwise. */
async function resolveSearchMode(): Promise<SearchMode> {
  const { embedding } = await getResolvedDefaults();
  if (embedding.providerId && embedding.modelId && embedding.dimensions) {
    return {
      searchType: 'hybrid',
      providerId: embedding.providerId,
      modelId: embedding.modelId,
      dimensions: embedding.dimensions,
      modelKey: embedding.modelKey,
    };
  }
  return { searchType: 'lexical' };
}

// ---------------------------------------------------------------------------
// Index, fields, experience
// ---------------------------------------------------------------------------

async function createIndex(mode: SearchMode, adminId: string) {
  // searchProvider is omitted: the index goes to the deployment's default engine.
  const input = {
    name: INDEX_NAME,
    displayName: 'Interakt Docs',
    description: "Interakt's own product documentation, one record per section. Powers in-app docs search.",
    searchType: mode.searchType,
    indexingStrategy: 'on_upload',
    language: 'english',
    synonyms: [],
    stopWords: [],
    vectorSimilarity: 'cosine',
    rrfRankConstant: 60,
    rrfWindowSize: 100,
    ...(mode.searchType === 'hybrid' && {
      aiProviderId: mode.providerId,
      aiModelId: mode.modelId,
      embeddingDimensions: mode.dimensions,
    }),
  };
  const created = await createSearchIndex(input as Parameters<typeof createSearchIndex>[0], adminId);
  logger.info('Created docs search index', { id: created.id, provider: created.searchProvider });
  return created;
}

/**
 * Key the records by their own id (so a reload replaces, never duplicates),
 * keep the auto-created catch-all system fields out of search, then add ours.
 */
async function applyFields(indexId: string, adminId: string) {
  const system = await getFieldsBySearchIndexId(indexId);
  for (const field of system) {
    if (field.fieldName === 'uniqueId') {
      await updateField(
        field.id,
        {
          mappingConfig: { mode: 'source', transform: 'none' },
          sourceFieldName: 'id',
          sourceFieldPath: 'id',
        } as Parameters<typeof updateField>[1],
        adminId,
      );
    } else {
      await updateField(
        field.id,
        { isSearchable: false, includeInResponse: false, isVectorSource: false },
        adminId,
      );
    }
  }

  const { created, errors } = await createFieldsFromMappingEntries(indexId, FIELDS, adminId);
  if (errors.length) throw new Error(`Could not create docs search fields: ${errors.map((e) => `${e.fieldName}: ${e.error}`).join('; ')}`);
  logger.info('Applied docs search fields', { created: created.length });
}

async function createExperience(indexId: string, adminId: string) {
  const input = {
    name: 'Interakt Docs',
    slug: DOCS_SEARCH_SLUG,
    description: 'Search over the product documentation, used by in-app docs search.',
    indexes: [{ searchIndexId: indexId, role: 'primary', weight: 1, sortOrder: 0 }],
    searchConfig: {
      defaultPageSize: 8,
      maxPageSize: 50,
      enableHighlighting: true,
      enableFacets: true,
      // 'auto' follows the index: keyword-only until it's rebuilt as hybrid.
      defaultSearchType: 'auto',
    },
    // The help drawer's Ask tab is the AI answer; this experience is just search.
    aiConfig: { enabled: false, providerId: null, modelId: null, summary: { enabled: false } },
    toolsConfig: { enabled: ['search'], settings: {} },
    displayConfig: {
      displayFields: [
        { fieldName: 'docTitle', role: 'title', order: 0 },
        { fieldName: 'section', role: 'subtitle', order: 1 },
        { fieldName: 'content', role: 'description', order: 2 },
        { fieldName: 'group', role: 'badge', order: 3 },
        { fieldName: 'url', role: 'link', order: 4 },
      ],
      layout: { showHighlights: true },
    },
    allowedOrigins: [],
    externalSources: [],
  };
  const created = await createSearchExperience(input as unknown as Parameters<typeof createSearchExperience>[0], adminId);
  logger.info('Created docs search experience', { slug: created.slug });
  return created;
}

// ---------------------------------------------------------------------------
// Status — shown on the Initial Setup page
// ---------------------------------------------------------------------------

export interface DocsSearchStatus {
  built: boolean;
  searchType: SearchMode['searchType'] | null;
  embeddingModelKey: string | null;
  sections: number | null;
  seededAt: string | null;
}

export async function getDocsSearchStatus(): Promise<DocsSearchStatus> {
  const entry = await getRegistryEntry(SEED_TYPES.DOCS, SEARCH_KEY).catch(() => null);
  const meta = entry?.metadata as Partial<DocsSearchMeta> | undefined;
  return {
    built: !!entry,
    searchType: meta?.searchType ?? null,
    embeddingModelKey: meta?.embeddingModelKey ?? null,
    sections: meta?.sections ?? null,
    seededAt: meta?.seededAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

const STARTUP_ATTEMPTS = 3;
const STARTUP_RETRY_MS = 20_000;

/**
 * Build docs search at server start, in the background. Retries a few times
 * because the search engine may still be starting alongside the app (e.g.
 * docker compose). Never throws.
 */
export async function buildDocsSearchOnStartup(): Promise<void> {
  for (let attempt = 1; attempt <= STARTUP_ATTEMPTS; attempt++) {
    try {
      await seedDocsSearch();
      return;
    } catch (e) {
      const last = attempt === STARTUP_ATTEMPTS;
      logger.warn(`Docs search build failed${last ? '' : ' — retrying'}`, {
        attempt,
        error: (e as Error).message,
      });
      if (last) return;
      await new Promise((resolve) => setTimeout(resolve, STARTUP_RETRY_MS));
    }
  }
}
