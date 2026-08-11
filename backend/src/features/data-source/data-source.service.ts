import { createLogger } from '@/shared/logger/logger';
import * as repository from './data-source.repository';
import * as searchIndexRepository from '@/features/search-index/search-index.repository';
import type {
  CreateDataSourceDTO,
  UpdateDataSourceDTO,
  UpdateHealthDTO,
  ListDataSourcesQuery,
} from './data-source.validation';
import type { ExternalSearchIndexConfig, DataSourceField, DataSourceSchema, DataSourceCapabilities } from '@/db/schema/data-sources.schema';
import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';
import { resolveSecret } from '@/features/secrets/secrets.service';
import { profileFields, resolveSampleSize } from './field-profiler';
import * as toolsService from '@/features/tools/tools.service';
import { inferFieldRole } from '@/shared/utils/field-roles';

const logger = createLogger('data-source-service');

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

export async function createDataSource(input: CreateDataSourceDTO, userId: string) {
  const slugAvailable = await repository.isSlugAvailable(input.slug);
  if (!slugAvailable) {
    throw new Error(`Data source with slug "${input.slug}" already exists`);
  }

  const created = await repository.createDataSource({
    name: input.name,
    slug: input.slug,
    description: input.description,
    type: input.type,
    config: input.config as any,
    schema: input.schema as any,
    searchIndexId: input.type === 'search_index' ? input.config.searchIndexId : null,
    createdBy: userId,
  });

  logger.info('Created data source', { dataSourceId: created.id, slug: created.slug, type: created.type, userId });

  return created;
}

export async function getDataSourceById(id: string) {
  return repository.getDataSourceById(id);
}

export async function getDataSourceBySlug(slug: string) {
  return repository.getDataSourceBySlug(slug);
}

export async function listDataSources(query: ListDataSourcesQuery) {
  return repository.listDataSources(query);
}

export async function updateDataSource(id: string, input: UpdateDataSourceDTO, userId: string) {
  const existing = await repository.getDataSourceById(id);
  if (!existing) {
    throw new Error(`Data source with ID "${id}" not found`);
  }

  const updated = await repository.updateDataSource(id, {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.config !== undefined && { config: input.config as any }),
    ...(input.schema !== undefined && { schema: input.schema as any }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
    updatedBy: userId,
  });

  logger.info('Updated data source', { dataSourceId: id, slug: existing.slug, userId });

  return updated;
}

export async function deleteDataSource(id: string, userId: string) {
  const existing = await repository.getDataSourceById(id);
  if (!existing) {
    throw new Error(`Data source with ID "${id}" not found`);
  }

  await repository.deleteDataSource(id);

  logger.info('Deleted data source', { dataSourceId: id, slug: existing.slug, userId });
}

// ============================================================================
// HEALTH (manual update)
// ============================================================================

export async function updateHealth(id: string, input: UpdateHealthDTO) {
  const existing = await repository.getDataSourceById(id);
  if (!existing) {
    throw new Error(`Data source with ID "${id}" not found`);
  }

  return repository.updateDataSource(id, {
    status: input.status,
    lastHealthMessage: input.message,
    lastHealthCheckAt: new Date(),
    ...(input.documentCount !== undefined && { documentCount: input.documentCount }),
    ...(input.storageSizeBytes !== undefined && { storageSizeBytes: input.storageSizeBytes }),
  });
}

// ============================================================================
// PERFORM HEALTH CHECK + SCHEMA DISCOVERY
// ============================================================================

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'error' | 'unknown';
  message: string;
  documentCount?: number;
  storageSizeBytes?: number;
  schema?: DataSourceSchema;
  checkedAt: string;
}

export async function performHealthCheck(id: string): Promise<HealthCheckResult> {
  const ds = await repository.getDataSourceById(id);
  if (!ds) {
    throw new Error(`Data source with ID "${id}" not found`);
  }

  let result: HealthCheckResult;

  try {
    switch (ds.type) {
      case 'search_index': {
        result = await checkSearchIndexHealth(ds.config as { searchIndexId?: string });
        break;
      }
      case 'search_index_external': {
        result = await checkExternalIndexHealth(ds.config as ExternalSearchIndexConfig);
        break;
      }
      default: {
        result = {
          status: 'unknown',
          message: `Health checks not yet supported for type: ${ds.type}`,
          checkedAt: new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Health check failed';
    logger.error('Health check failed', err as Error, { dataSourceId: id });
    result = {
      status: 'error',
      message,
      checkedAt: new Date().toISOString(),
    };
  }

  // Persist health result + discovered schema.
  //
  // The discovered schema is merged over the stored one rather than replacing it. Discovery
  // reads the index, and the index cannot know what an operator wrote about a field — so a
  // wholesale write silently destroyed every field description on every health check. That
  // is a quiet failure of the worst kind: the save succeeds, the text is gone, and the only
  // symptom is a description box that empties itself.
  await repository.updateDataSource(id, {
    status: result.status,
    lastHealthMessage: result.message,
    lastHealthCheckAt: new Date(),
    ...(result.documentCount !== undefined && { documentCount: result.documentCount }),
    ...(result.storageSizeBytes !== undefined && { storageSizeBytes: result.storageSizeBytes }),
    ...(result.schema && {
      schema: mergeOperatorFieldEdits(ds.schema as DataSourceSchema | null, result.schema) as never,
    }),
  });

  return result;
}

/**
 * Carry operator-authored field metadata across a schema rediscovery.
 *
 * Everything discovery produces is derived from the index and is safe to overwrite — types,
 * capabilities, profiles. `description` is the exception: it exists only because a person
 * typed it, it is rendered into the planning prompt, and nothing can regenerate it. It is
 * matched by field name, which is the only stable identity a field has across two reads.
 *
 * A field that disappeared from the index does not come back: its description goes with it,
 * because advertising a field the index no longer has is how the planner ends up filtering
 * on something that cannot match.
 */
export function mergeOperatorFieldEdits(
  stored: DataSourceSchema | null | undefined,
  discovered: DataSourceSchema,
): DataSourceSchema {
  const previous = stored?.fields;
  if (!previous?.length || !discovered.fields?.length) return discovered;

  const descriptions = new Map(
    previous
      .filter((f) => typeof f.description === 'string' && f.description.trim() !== '')
      .map((f) => [f.name, f.description as string]),
  );
  if (descriptions.size === 0) return discovered;

  return {
    ...discovered,
    fields: discovered.fields.map((field) => {
      // A description rediscovery somehow supplied wins — it is fresher by definition.
      if (field.description) return field;
      const carried = descriptions.get(field.name);
      return carried ? { ...field, description: carried } : field;
    }),
  };
}

/**
 * Re-derive the field snapshot for every data source backed by a search index.
 *
 * `data_sources.schema.fields` is a denormalized copy of the index's fields, and
 * it is what the tool description generator tells the model the index contains.
 * It is otherwise only refreshed as a side effect of a health check, so without
 * this an index field that was just deleted keeps being advertised to the LLM.
 *
 * Best-effort: a failure here must not fail the field change that triggered it.
 */
export async function refreshSchemaForSearchIndex(searchIndexId: string): Promise<void> {
  try {
    const sources = await repository.getDataSourcesBySearchIndexId(searchIndexId);

    await Promise.all(
      sources.map(source =>
        performHealthCheck(source.id)
          .then(async () => {
            // The data source snapshot is only half of it. A tool's inputSchema —
            // including the filters[].field enum, the only list of filterable
            // fields the model ever sees — is generated at scaffold time and never
            // again. Without this, making a field filterable has no visible
            // effect: the model still cannot name it in a filter.
            const refreshed = await repository.getDataSourceById(source.id);
            if (refreshed) {
              await toolsService.regenerateSchemasForDataSource(
                refreshed.id,
                refreshed.name,
                refreshed.type,
                refreshed.schema as DataSourceSchema | null,
              );
            }
          })
          .catch(err => {
            logger.warn('Failed to refresh data source schema', {
              dataSourceId: source.id,
              searchIndexId,
              error: err instanceof Error ? err.message : 'Unknown error',
            });
          })
      )
    );
  } catch (err) {
    logger.warn('Failed to refresh data source schemas for search index', {
      searchIndexId,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

// ============================================================================
// SEARCH INDEX HEALTH (internal)
// ============================================================================

async function checkSearchIndexHealth(
  config: { searchIndexId?: string },
): Promise<HealthCheckResult> {
  const now = new Date().toISOString();

  if (!config.searchIndexId) {
    return { status: 'error', message: 'No search index ID configured', checkedAt: now };
  }

  const index = await searchIndexRepository.getSearchIndexById(config.searchIndexId);
  if (!index) {
    return { status: 'error', message: 'Referenced search index not found', checkedAt: now };
  }

  // Map search_index_fields → DataSourceField[]
  const fields = mapSearchIndexFieldsToSchema(index.fields);

  return {
    status: 'healthy',
    message: `Index "${index.name}" is available (${index.fields.length} fields)`,
    documentCount: index.documentCount ?? undefined,
    storageSizeBytes: index.indexSizeBytes ?? undefined,
    schema: { fields, lastDiscoveredAt: now },
    checkedAt: now,
  };
}

function mapSearchIndexFieldsToSchema(fields: SearchIndexField[]): DataSourceField[] {
  return fields
    .filter((f) => !f.isSystemField)
    .map((f) => ({
      name: f.fieldName,
      displayName: f.displayName || f.fieldName,
      type: f.fieldType,
      role: inferFieldRole(f.fieldName) ?? null,
      isSearchable: f.isSearchable,
      isFacetable: f.isFacetable,
      isFilterable: f.isFacetable, // facetable fields are also filterable
    }));
}

// ============================================================================
// EXTERNAL INDEX HEALTH + SCHEMA DISCOVERY
// ============================================================================

async function checkExternalIndexHealth(
  config: ExternalSearchIndexConfig,
): Promise<HealthCheckResult> {
  const now = new Date().toISOString();

  if (!config.connection?.url) {
    return { status: 'error', message: 'No connection URL configured', checkedAt: now };
  }

  // Step 1: Connectivity check
  const connectivityResult = await probeExternalConnection(config, now);
  if (connectivityResult.status !== 'healthy') {
    return connectivityResult;
  }

  // Step 2: Fetch index statistics (best-effort)
  let documentCount: number | undefined;
  let storageSizeBytes: number | undefined;
  let statsNote = '';
  try {
    const stats = await fetchExternalIndexStats(config);
    if (stats) {
      documentCount = stats.documentCount;
      storageSizeBytes = stats.storageSizeBytes;
      statsNote = ` — ${stats.documentCount.toLocaleString()} docs`;
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.warn('Index stats fetch failed (non-fatal)', { provider: config.provider, error: errMsg });
  }

  // Step 3: Try to discover schema (best-effort, doesn't affect health status)
  let schema: DataSourceSchema | undefined;
  let schemaNote = '';
  try {
    logger.info('Attempting schema discovery', { provider: config.provider, indexName: config.connection.indexName });
    const discovered = await discoverExternalSchema(config);
    if (discovered.fields.length > 0) {
      schema = {
        fields: discovered.fields,
        lastDiscoveredAt: now,
        capabilities: discovered.capabilities,
      };
      schemaNote = ` — ${discovered.fields.length} fields discovered`;
      logger.info('Schema discovery succeeded', { provider: config.provider, fieldCount: discovered.fields.length });
    } else {
      logger.warn('Schema discovery returned no fields', { provider: config.provider });
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    schemaNote = ` — schema discovery failed: ${errMsg}`;
    logger.warn('Schema discovery failed (non-fatal)', {
      provider: config.provider,
      error: errMsg,
    });
  }

  return {
    ...connectivityResult,
    message: connectivityResult.message + statsNote + schemaNote,
    documentCount,
    storageSizeBytes,
    schema,
  };
}

async function probeExternalConnection(
  config: ExternalSearchIndexConfig,
  now: string,
): Promise<HealthCheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const baseUrl = config.connection.url;

  try {
    // Try HEAD first, fallback to GET (some providers like Azure don't support HEAD on base URL)
    let response: Response;
    try {
      response = await fetch(baseUrl, {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'User-Agent': 'Interakt-HealthCheck/1.0' },
      });
    } catch {
      // HEAD might fail on some providers, try GET
      response = await fetch(baseUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'Interakt-HealthCheck/1.0' },
      });
    }

    // 2xx, 401, 403, 404 all indicate the server is reachable
    // (404 is common for Azure AI Search base URL without a path)
    if (response.ok || response.status === 401 || response.status === 403 || response.status === 404) {
      return {
        status: 'healthy',
        // The probe is unauthenticated, so 401/403/404 mean "a server answered" — not a
        // problem. Printing the raw code alongside a successful discovery produced messages
        // like "is reachable (HTTP 403) — 200 docs — 36 fields discovered", which reads as a
        // failure that somehow worked.
        message: `${config.provider} at ${baseUrl} is reachable`,
        checkedAt: now,
      };
    }

    return {
      status: 'degraded',
      message: `${config.provider} returned HTTP ${response.status}`,
      checkedAt: now,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed';
    return {
      status: 'error',
      message: `Cannot reach ${config.provider} at ${baseUrl}: ${message}`,
      checkedAt: now,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// SHARED HELPERS
// ============================================================================

async function resolveCredentials(config: ExternalSearchIndexConfig): Promise<string | null> {
  const secretRef = config.connection.credentials?.secretRef;
  if (!secretRef) return null;

  const resolved = await resolveSecret(secretRef);
  if (!resolved) {
    logger.warn('Failed to resolve secret reference — ensure the secret exists in the vault', { secretRef });
  }
  return resolved;
}

async function buildAuthHeaders(config: ExternalSearchIndexConfig): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'User-Agent': 'Interakt/1.0' };
  const apiKey = await resolveCredentials(config);
  if (!apiKey) return headers;

  switch (config.provider) {
    case 'azure_ai_search':
      headers['api-key'] = apiKey;
      break;
    case 'elasticsearch':
      if (config.connection.authType === 'api_key') headers['Authorization'] = `ApiKey ${apiKey}`;
      else if (config.connection.authType === 'bearer') headers['Authorization'] = `Bearer ${apiKey}`;
      break;
    default:
      headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

// ============================================================================
// INDEX STATISTICS — PROVIDER-SPECIFIC
// ============================================================================

interface IndexStats {
  documentCount: number;
  storageSizeBytes: number;
}

async function fetchExternalIndexStats(config: ExternalSearchIndexConfig): Promise<IndexStats | null> {
  switch (config.provider) {
    case 'elasticsearch':
      return fetchElasticsearchStats(config);
    case 'azure_ai_search':
      return fetchAzureAISearchStats(config);
    default:
      return null;
  }
}

/**
 * Elasticsearch: GET /{indexName}/_stats/docs,store
 * Returns { _all: { primaries: { docs: { count }, store: { size_in_bytes } } } }
 */
async function fetchElasticsearchStats(config: ExternalSearchIndexConfig): Promise<IndexStats | null> {
  const baseUrl = config.connection.url.replace(/\/$/, '');
  const indexName = config.connection.indexName;
  if (!indexName) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const headers = await buildAuthHeaders(config);
    const response = await fetch(`${baseUrl}/${indexName}/_stats/docs,store`, {
      signal: controller.signal,
      headers,
    });

    if (!response.ok) return null;

    const data = await response.json() as {
      _all?: { primaries?: { docs?: { count?: number }; store?: { size_in_bytes?: number } } };
    };
    const primaries = data._all?.primaries;

    return {
      documentCount: primaries?.docs?.count ?? 0,
      storageSizeBytes: primaries?.store?.size_in_bytes ?? 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Azure AI Search: GET /indexes/{indexName}/stats?api-version=2024-07-01
 * Returns { documentCount: number, storageSize: number }
 */
async function fetchAzureAISearchStats(config: ExternalSearchIndexConfig): Promise<IndexStats | null> {
  const baseUrl = config.connection.url.replace(/\/$/, '');
  const indexName = config.connection.indexName;
  if (!indexName) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const headers = await buildAuthHeaders(config);
    headers['Content-Type'] = 'application/json';

    const url = `${baseUrl}/indexes/${indexName}/stats?api-version=2024-07-01`;
    const response = await fetch(url, { signal: controller.signal, headers });

    if (!response.ok) return null;

    const data = await response.json() as { documentCount?: number; storageSize?: number };

    return {
      documentCount: data.documentCount ?? 0,
      storageSizeBytes: data.storageSize ?? 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// SCHEMA DISCOVERY — PROVIDER-SPECIFIC
// ============================================================================

interface DiscoveredSchema {
  fields: DataSourceField[];
  capabilities?: DataSourceCapabilities;
}

async function discoverExternalSchema(
  config: ExternalSearchIndexConfig,
): Promise<DiscoveredSchema> {
  const discovered = await discoverExternalFields(config);
  if (discovered.fields.length === 0) return discovered;

  // Profiling is a second read against the index, so it is strictly best-effort: a field
  // list with no profile is still useful, and a sampling failure must not turn a healthy
  // schema discovery into a failed one.
  const sampleSize = resolveSampleSize(config.profileSampleSize);
  if (sampleSize === 0) return discovered;

  try {
    const documents = await fetchDocumentSample(config, sampleSize);
    if (documents.length === 0) {
      logger.warn('Field profiling skipped — no documents sampled', { provider: config.provider });
      return discovered;
    }
    return {
      ...discovered,
      fields: profileFields(discovered.fields, documents, new Date().toISOString()),
    };
  } catch (err) {
    logger.warn('Field profiling failed (non-fatal)', {
      provider: config.provider,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    return discovered;
  }
}

async function discoverExternalFields(
  config: ExternalSearchIndexConfig,
): Promise<DiscoveredSchema> {
  switch (config.provider) {
    case 'elasticsearch':
      return { fields: await discoverElasticsearchSchema(config) };
    case 'azure_ai_search':
      return discoverAzureAISearchSchema(config);
    default:
      return { fields: [] };
  }
}

// ============================================================================
// DOCUMENT SAMPLING (for field profiling)
// ============================================================================

/**
 * Fetch a sample of documents for profiling.
 *
 * Unsorted and unfiltered on purpose — any ordering would bias the sample toward whatever
 * the sort field favours, and a null rate measured on a biased sample is worse than no
 * null rate at all.
 */
async function fetchDocumentSample(
  config: ExternalSearchIndexConfig,
  sampleSize: number,
): Promise<Record<string, unknown>[]> {
  switch (config.provider) {
    case 'elasticsearch':
      return sampleElasticsearchDocuments(config, sampleSize);
    case 'azure_ai_search':
      return sampleAzureAISearchDocuments(config, sampleSize);
    default:
      return [];
  }
}

async function sampleElasticsearchDocuments(
  config: ExternalSearchIndexConfig,
  sampleSize: number,
): Promise<Record<string, unknown>[]> {
  const baseUrl = config.connection.url.replace(/\/$/, '');
  const indexName = config.connection.indexName;
  if (!indexName) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const headers = await buildAuthHeaders(config);
    headers['Content-Type'] = 'application/json';

    const response = await fetch(`${baseUrl}/${indexName}/_search`, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({ size: sampleSize, query: { match_all: {} }, track_total_hits: false }),
    });

    if (!response.ok) return [];

    const data = await response.json() as {
      hits?: { hits?: Array<{ _source?: Record<string, unknown> }> };
    };
    return (data.hits?.hits ?? [])
      .map((hit) => hit._source)
      .filter((source): source is Record<string, unknown> => !!source);
  } finally {
    clearTimeout(timeout);
  }
}

async function sampleAzureAISearchDocuments(
  config: ExternalSearchIndexConfig,
  sampleSize: number,
): Promise<Record<string, unknown>[]> {
  const baseUrl = config.connection.url.replace(/\/$/, '');
  const indexName = config.connection.indexName;
  if (!indexName) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const headers = await buildAuthHeaders(config);
    headers['Content-Type'] = 'application/json';

    const url = `${baseUrl}/indexes/${indexName}/docs/search?api-version=2024-07-01`;
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers,
      // Azure caps `top` at 1000 per page; the profiler never asks for that many.
      body: JSON.stringify({ search: '*', top: sampleSize, count: false }),
    });

    if (!response.ok) return [];

    const data = await response.json() as { value?: Record<string, unknown>[] };
    // Strip Azure's response annotations so the profiler sees document fields only.
    return (data.value ?? []).map((doc) => {
      const clean: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(doc)) {
        if (!key.startsWith('@search.')) clean[key] = value;
      }
      return clean;
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Elasticsearch: GET /{indexName}/_mapping
 * Returns { [indexName]: { mappings: { properties: { fieldName: { type, ... } } } } }
 */
async function discoverElasticsearchSchema(
  config: ExternalSearchIndexConfig,
): Promise<DataSourceField[]> {
  const baseUrl = config.connection.url.replace(/\/$/, '');
  const indexName = config.connection.indexName;
  if (!indexName) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const headers = await buildAuthHeaders(config);

    const response = await fetch(`${baseUrl}/${indexName}/_mapping`, {
      signal: controller.signal,
      headers,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Authentication failed — check that the API key is correct');
      }
      return [];
    }

    const data = await response.json() as Record<string, { mappings?: { properties?: Record<string, ESFieldMapping> } }>;
    const indexData = data[indexName] || Object.values(data)[0];
    const properties = indexData?.mappings?.properties;

    if (!properties) return [];

    return parseElasticsearchProperties(properties);
  } finally {
    clearTimeout(timeout);
  }
}

interface ESFieldMapping {
  type?: string;
  properties?: Record<string, ESFieldMapping>;
  fields?: Record<string, ESFieldMapping>;
}

function parseElasticsearchProperties(
  properties: Record<string, ESFieldMapping>,
  prefix = '',
): DataSourceField[] {
  const fields: DataSourceField[] = [];

  for (const [name, mapping] of Object.entries(properties)) {
    const fullName = prefix ? `${prefix}.${name}` : name;

    // Skip internal/vector fields
    if (name.startsWith('_') || mapping.type === 'dense_vector') continue;

    if (mapping.properties) {
      // Nested object — recurse
      fields.push(...parseElasticsearchProperties(mapping.properties, fullName));
    } else {
      // A `text` field can't be term-matched, but usually carries a `keyword` sub-field
      // that can. Record it so filters target something exact-matchable instead of
      // being dropped or silently matching nothing.
      const keywordSubfield = findKeywordSubfield(mapping.fields);
      fields.push({
        name: fullName,
        displayName: name,
        type: mapESType(mapping.type),
        providerType: mapping.type,
        ...(keywordSubfield ? { filterField: `${fullName}.${keywordSubfield}` } : {}),
        role: inferFieldRole(name) ?? null,
        isSearchable: mapping.type === 'text' || mapping.type === 'search_as_you_type',
        isFacetable: mapping.type === 'keyword' || mapping.type === 'integer' || mapping.type === 'long',
        isFilterable: mapping.type !== 'text' || !!keywordSubfield,
        // Elasticsearch permits sorting any non-analyzed field; `text` is sortable only
        // through a keyword sub-field.
        isSortable: mapping.type !== 'text' || !!keywordSubfield,
      });
    }
  }

  return fields;
}

/** Name of the first `keyword` sub-field in an ES multi-field mapping, if any. */
function findKeywordSubfield(subfields?: Record<string, ESFieldMapping>): string | undefined {
  if (!subfields) return undefined;
  for (const [name, mapping] of Object.entries(subfields)) {
    if (mapping.type === 'keyword') return name;
  }
  return undefined;
}

function mapESType(esType?: string): string {
  switch (esType) {
    case 'text':
    case 'keyword':
    case 'search_as_you_type':
      return 'text';
    case 'integer':
    case 'long':
    case 'short':
    case 'byte':
      return 'number';
    case 'float':
    case 'double':
    case 'half_float':
    case 'scaled_float':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
    case 'date_nanos':
      return 'date';
    case 'geo_point':
    case 'geo_shape':
      return 'geo';
    default:
      return esType || 'unknown';
  }
}

/**
 * Azure AI Search: GET /indexes/{indexName}?api-version=2024-07-01
 * Returns { fields: [{ name, type, searchable, filterable, facetable, ... }] }
 */
async function discoverAzureAISearchSchema(
  config: ExternalSearchIndexConfig,
): Promise<DiscoveredSchema> {
  const baseUrl = config.connection.url.replace(/\/$/, '');
  const indexName = config.connection.indexName;
  if (!indexName) return { fields: [] };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const headers = await buildAuthHeaders(config);
    headers['Content-Type'] = 'application/json';

    const url = `${baseUrl}/indexes/${indexName}?api-version=2024-07-01`;
    logger.info('Azure AI Search schema discovery', { url: url.replace(/api-key=[^&]+/, 'api-key=***') });

    const response = await fetch(url, { signal: controller.signal, headers });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.warn('Azure AI Search schema fetch failed', { status: response.status, body: body.slice(0, 200) });
      if (response.status === 401 || response.status === 403) {
        throw new Error('Authentication failed — verify the secret in the vault contains a valid API key');
      }
      return { fields: [] };
    }

    const data = await response.json() as AzureIndexDefinition;
    if (!data.fields) {
      logger.warn('Azure AI Search response has no fields property');
      return { fields: [] };
    }

    // Discover capabilities: semantic config and vector field
    const capabilities: DataSourceCapabilities = {};

    // Semantic configuration (Azure uses semanticSearch or semantic depending on API version)
    const semanticSection = data.semanticSearch ?? data.semantic;
    if (semanticSection?.configurations?.length) {
      capabilities.semanticConfigName =
        semanticSection.defaultConfiguration ?? semanticSection.configurations[0].name;
    }

    // Vector field — find first Collection(Edm.Single) field with dimensions
    const vectorField = data.fields.find(
      (f) => f.type === 'Collection(Edm.Single)' && f.vectorSearchDimensions,
    );
    if (vectorField?.vectorSearchDimensions) {
      capabilities.vectorField = {
        name: vectorField.name,
        dimensions: vectorField.vectorSearchDimensions,
      };
    }

    logger.info('Azure capabilities discovered', {
      indexName,
      semanticConfig: capabilities.semanticConfigName ?? 'none',
      vectorField: capabilities.vectorField?.name ?? 'none',
      vectorDimensions: capabilities.vectorField?.dimensions,
    });

    const fields = data.fields
      .filter((f) => !f.name.startsWith('_') && f.type !== 'Collection(Edm.Single)')
      .filter((f) => f.retrievable !== false)
      .map((f) => ({
        name: f.name,
        displayName: f.name,
        type: mapAzureType(f.type),
        providerType: f.type,
        role: inferFieldRole(f.name) ?? null,
        isSearchable: f.searchable ?? false,
        isFacetable: f.facetable ?? false,
        isFilterable: f.filterable ?? false,
        isRetrievable: f.retrievable !== false,
        // Azure rejects the entire request when asked to order by an unsortable field,
        // so this has to be carried through rather than assumed.
        isSortable: f.sortable ?? false,
      }));

    return {
      fields,
      capabilities: Object.keys(capabilities).length > 0 ? capabilities : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

interface AzureField {
  name: string;
  type: string;
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  facetable?: boolean;
  retrievable?: boolean;
  key?: boolean;
  vectorSearchDimensions?: number;
  vectorSearchProfileName?: string;
}

interface AzureSemanticConfig {
  name: string;
}

interface AzureIndexDefinition {
  fields?: AzureField[];
  semanticSearch?: {
    configurations?: AzureSemanticConfig[];
    defaultConfiguration?: string;
  };
  // Older API format
  semantic?: {
    configurations?: AzureSemanticConfig[];
    defaultConfiguration?: string;
  };
}

function mapAzureType(azureType: string): string {
  switch (azureType) {
    case 'Edm.String':
      return 'text';
    case 'Edm.Int32':
    case 'Edm.Int64':
    case 'Edm.Double':
      return 'number';
    case 'Edm.Boolean':
      return 'boolean';
    case 'Edm.DateTimeOffset':
      return 'date';
    case 'Edm.GeographyPoint':
      return 'geo';
    case 'Collection(Edm.String)':
      return 'text';
    default:
      return azureType;
  }
}

// ============================================================================
// SLUG AVAILABILITY
// ============================================================================

export async function isSlugAvailable(slug: string, excludeId?: string) {
  return repository.isSlugAvailable(slug, excludeId);
}
