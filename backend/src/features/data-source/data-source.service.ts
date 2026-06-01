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

  // Persist health result + discovered schema
  await repository.updateDataSource(id, {
    status: result.status,
    lastHealthMessage: result.message,
    lastHealthCheckAt: new Date(),
    ...(result.documentCount !== undefined && { documentCount: result.documentCount }),
    ...(result.storageSizeBytes !== undefined && { storageSizeBytes: result.storageSizeBytes }),
    ...(result.schema && { schema: result.schema as any }),
  });

  return result;
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

function inferFieldRole(fieldName: string): DataSourceField['role'] {
  const name = fieldName.toLowerCase();
  if (name === 'title' || name === 'name' || name === 'product_name') return 'title';
  if (name === 'description' || name === 'summary') return 'description';
  if (name === 'content' || name === 'body' || name === 'text') return 'content';
  if (name === 'price' || name === 'cost') return 'price';
  if (name === 'image' || name === 'image_url' || name === 'thumbnail') return 'image';
  if (name === 'category' || name === 'categories') return 'category';
  if (name === 'url' || name === 'link' || name === 'href') return 'url';
  if (name === 'id' || name === 'unique_id') return 'id';
  if (name.includes('date') || name.includes('created') || name.includes('updated')) return 'date';
  return null;
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
        message: `${config.provider} at ${baseUrl} is reachable (HTTP ${response.status})`,
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
  switch (config.provider) {
    case 'elasticsearch':
      return { fields: await discoverElasticsearchSchema(config) };
    case 'azure_ai_search':
      return discoverAzureAISearchSchema(config);
    default:
      return { fields: [] };
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
      fields.push({
        name: fullName,
        displayName: name,
        type: mapESType(mapping.type),
        role: inferFieldRole(name) ?? null,
        isSearchable: mapping.type === 'text' || mapping.type === 'search_as_you_type',
        isFacetable: mapping.type === 'keyword' || mapping.type === 'integer' || mapping.type === 'long',
        isFilterable: mapping.type !== 'text',
      });
    }
  }

  return fields;
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
        role: inferFieldRole(f.name) ?? null,
        isSearchable: f.searchable ?? false,
        isFacetable: f.facetable ?? false,
        isFilterable: f.filterable ?? false,
        isRetrievable: f.retrievable !== false,
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
