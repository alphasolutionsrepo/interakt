// src/features/tools/tools.registry.ts

/**
 * Tool Capability Registry
 *
 * Code-level registry that defines:
 * 1. Which operations each data source type supports
 * 2. What standalone executor types are available
 * 3. Metadata for each capability (labels, descriptions, default configs)
 *
 * This is the single source of truth for what tools can be created.
 * The UI reads this to show only available options (never disabled ones).
 * New capabilities are added by: building an executor + adding a registry entry.
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Executor types — how a tool runs.
 *
 * Note: MCP is intentionally NOT a tool executor type. MCP-sourced
 * capabilities are exposed via `mcp_connections` (a separate provider concept)
 * — tools are materialized at runtime from a connection's discovered catalog
 * and dispatched through a dedicated MCP executor path.
 */
export type ExecutorType = 'data_source' | 'http' | 'web_search' | 'ai_call';

/** Data source operations — what a data_source tool does */
export type DataSourceOperation = 'search' | 'inspect' | 'enumerate' | 'lookup' | 'query';

/** Data source types from the schema */
export type DataSourceType = 'search_index' | 'search_index_external' | 'file_store' | 'database';

/** Describes a single operation that can be performed on a data source type */
export interface OperationCapability {
  /** The operation identifier */
  operation: DataSourceOperation;
  /** Human-readable label for UI */
  label: string;
  /** Short description for UI tooltips */
  description: string;
  /** Default slug suffix when scaffolding (e.g., "search" → "{datasource-slug}-search") */
  slugSuffix: string;
  /** Template for auto-generating AI description (placeholders: {dataSourceName}, {fieldList}) */
  aiDescriptionTemplate: string;
  /** Whether input schema can be auto-generated from data source schema */
  supportsAutoSchema: boolean;
  /** Default executor config for this operation */
  defaultConfig: Record<string, unknown>;
}

/** Describes a standalone executor (no data source required) */
export interface StandaloneExecutorCapability {
  /** The executor type */
  executorType: Exclude<ExecutorType, 'data_source'>;
  /** Human-readable label for UI */
  label: string;
  /** Short description for UI */
  description: string;
  /** Icon identifier for UI */
  icon: string;
  /** Default executor config */
  defaultConfig: Record<string, unknown>;
}

// ============================================================================
// DATA SOURCE CAPABILITIES
// ============================================================================

/**
 * Maps each data source type to the operations it supports.
 * Only operations with a built executor appear here.
 */
export const DATA_SOURCE_CAPABILITIES: Record<DataSourceType, OperationCapability[]> = {
  // ---------------------------------------------------------------------------
  // Search Index (managed by our platform)
  // ---------------------------------------------------------------------------
  search_index: [
    {
      operation: 'search',
      label: 'Search',
      description: 'Query for ranked results using text search, filters, and sorting',
      slugSuffix: 'search',
      aiDescriptionTemplate:
        'Search the "{dataSourceName}" data source. Available fields: {fieldList}. ' +
        'Use filters to narrow results and sort to order them. Returns ranked results with relevance scores.',
      supportsAutoSchema: true,
      defaultConfig: { maxResults: 10 },
    },
    {
      operation: 'inspect',
      label: 'Schema Explorer',
      description: 'Describe the schema, available fields, filter options, and capabilities',
      slugSuffix: 'schema',
      aiDescriptionTemplate:
        'Inspect the "{dataSourceName}" data source to understand its structure. ' +
        'Returns available fields, their types, which are searchable/filterable, and example values. ' +
        'Use this BEFORE searching to understand what filters and sort options are available.',
      supportsAutoSchema: false,
      defaultConfig: { includeFieldStats: true, includeExampleValues: true },
    },
    {
      operation: 'enumerate',
      label: 'Field Values',
      description: 'List distinct values for a specific field (for filter discovery)',
      slugSuffix: 'values',
      aiDescriptionTemplate:
        'List the distinct values available for a specific field in "{dataSourceName}". ' +
        'Use this to discover what filter values exist (e.g., all categories, all brands). ' +
        'Always use this before filtering to ensure you use valid values.',
      supportsAutoSchema: false,
      defaultConfig: { maxValues: 50 },
    },
    {
      operation: 'lookup',
      label: 'Find Record',
      description: 'Retrieve a specific document by its unique identifier',
      slugSuffix: 'find',
      aiDescriptionTemplate:
        'Look up a specific item by ID from "{dataSourceName}". ' +
        'Use this when you have a specific document ID and need its full details.',
      supportsAutoSchema: false,
      defaultConfig: {},
    },
  ],

  // ---------------------------------------------------------------------------
  // External Search Index (user's own Elasticsearch or Azure AI Search)
  // ---------------------------------------------------------------------------
  search_index_external: [
    {
      operation: 'search',
      label: 'Search',
      description: 'Query the external search index for ranked results',
      slugSuffix: 'search',
      aiDescriptionTemplate:
        'Search the external "{dataSourceName}" index. Available fields: {fieldList}. ' +
        'Returns ranked results from the connected search provider.',
      supportsAutoSchema: true,
      defaultConfig: { maxResults: 10 },
    },
    {
      operation: 'inspect',
      label: 'Schema Explorer',
      description: 'Describe the external index schema and field mappings',
      slugSuffix: 'schema',
      aiDescriptionTemplate:
        'Inspect the external "{dataSourceName}" index to understand its structure. ' +
        'Returns available fields, their types, and which are searchable or filterable.',
      supportsAutoSchema: false,
      defaultConfig: { includeFieldStats: false, includeExampleValues: false },
    },
    {
      operation: 'enumerate',
      label: 'Field Values',
      description: 'List distinct values for a field in the external index',
      slugSuffix: 'values',
      aiDescriptionTemplate:
        'List distinct values for a field in the external "{dataSourceName}" index. ' +
        'Use this to discover valid filter values before searching.',
      supportsAutoSchema: false,
      defaultConfig: { maxValues: 50 },
    },
    {
      operation: 'lookup',
      label: 'Find Record',
      description: 'Retrieve a specific document by ID from the external index',
      slugSuffix: 'find',
      aiDescriptionTemplate:
        'Look up a specific document by ID from the external "{dataSourceName}" index.',
      supportsAutoSchema: false,
      defaultConfig: {},
    },
  ],

  // ---------------------------------------------------------------------------
  // File Store (uploaded documents, chunked and embedded)
  // ---------------------------------------------------------------------------
  file_store: [
    {
      operation: 'search',
      label: 'Search',
      description: 'Search across uploaded documents using semantic or keyword search',
      slugSuffix: 'search',
      aiDescriptionTemplate:
        'Search uploaded documents in "{dataSourceName}". ' +
        'Returns relevant document chunks with source file attribution.',
      supportsAutoSchema: false,
      defaultConfig: { maxResults: 10 },
    },
    {
      operation: 'lookup',
      label: 'Find Record',
      description: 'Retrieve a specific document or chunk by ID',
      slugSuffix: 'find',
      aiDescriptionTemplate:
        'Look up a specific document or chunk by ID from "{dataSourceName}".',
      supportsAutoSchema: false,
      defaultConfig: {},
    },
  ],

  // ---------------------------------------------------------------------------
  // Database (future — PostgreSQL, MySQL, etc.)
  // ---------------------------------------------------------------------------
  database: [
    {
      operation: 'query',
      label: 'Query',
      description: 'Execute a structured read-only query against the database',
      slugSuffix: 'query',
      aiDescriptionTemplate:
        'Query the "{dataSourceName}" database. Available tables: {fieldList}. ' +
        'Executes read-only SQL queries with safety guardrails.',
      supportsAutoSchema: true,
      defaultConfig: {},
    },
    {
      operation: 'inspect',
      label: 'Schema Explorer',
      description: 'Describe the database schema, tables, and column types',
      slugSuffix: 'schema',
      aiDescriptionTemplate:
        'Inspect the "{dataSourceName}" database to understand its schema. ' +
        'Returns available tables, columns, types, and relationships.',
      supportsAutoSchema: false,
      defaultConfig: {},
    },
    {
      operation: 'lookup',
      label: 'Find Record',
      description: 'Retrieve a specific row by primary key',
      slugSuffix: 'find',
      aiDescriptionTemplate:
        'Look up a specific record by primary key from "{dataSourceName}".',
      supportsAutoSchema: false,
      defaultConfig: {},
    },
  ],
};

// ============================================================================
// STANDALONE EXECUTORS
// ============================================================================

/**
 * Executor types that don't require a data source.
 */
export const STANDALONE_EXECUTORS: StandaloneExecutorCapability[] = [
  {
    executorType: 'http',
    label: 'HTTP API',
    description: 'Call any external REST API or webhook',
    icon: 'globe',
    defaultConfig: {
      method: 'GET',
      baseUrl: '',
      headers: {},
    },
  },
  {
    executorType: 'web_search',
    label: 'Web Search',
    description: 'Search the live web via Tavily to ground AI responses in up-to-date information',
    icon: 'search',
    defaultConfig: {
      searchDepth: 'basic',
      maxResults: 5,
      includeAnswer: false,
    },
  },
  {
    executorType: 'ai_call',
    label: 'AI Responder',
    description: 'Sub-LLM call with custom instructions for specialized reasoning',
    icon: 'brain',
    defaultConfig: {
      instructions: '',
      contextSources: ['conversation_history'],
    },
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get supported operations for a data source type.
 * Returns empty array if data source type is unknown.
 */
export function getOperationsForDataSource(dataSourceType: DataSourceType): OperationCapability[] {
  return DATA_SOURCE_CAPABILITIES[dataSourceType] ?? [];
}

/**
 * Check if a specific operation is supported for a data source type.
 */
export function isOperationSupported(
  dataSourceType: DataSourceType,
  operation: DataSourceOperation,
): boolean {
  return getOperationsForDataSource(dataSourceType).some((cap) => cap.operation === operation);
}

/**
 * Get the capability definition for a specific operation on a data source type.
 * Returns undefined if not supported.
 */
export function getOperationCapability(
  dataSourceType: DataSourceType,
  operation: DataSourceOperation,
): OperationCapability | undefined {
  return getOperationsForDataSource(dataSourceType).find((cap) => cap.operation === operation);
}

/**
 * Get a standalone executor capability by type.
 */
export function getStandaloneExecutor(
  executorType: Exclude<ExecutorType, 'data_source'>,
): StandaloneExecutorCapability | undefined {
  return STANDALONE_EXECUTORS.find((e) => e.executorType === executorType);
}

/**
 * Generate a default tool slug from data source slug + operation.
 * e.g., ("products-catalog", "search") → "products-catalog-search"
 */
export function generateToolSlug(dataSourceSlug: string, operation: DataSourceOperation): string {
  const capability = Object.values(DATA_SOURCE_CAPABILITIES)
    .flat()
    .find((cap) => cap.operation === operation);
  const suffix = capability?.slugSuffix ?? operation;
  return `${dataSourceSlug}-${suffix}`;
}

/**
 * Generate a default tool name from data source name + operation.
 * e.g., ("Products Catalog", "search") → "Products Catalog Search"
 */
export function generateToolName(dataSourceName: string, operation: DataSourceOperation): string {
  const capability = Object.values(DATA_SOURCE_CAPABILITIES)
    .flat()
    .find((cap) => cap.operation === operation);
  const label = capability?.label ?? operation;
  return `${dataSourceName} ${label}`;
}

/**
 * Get all available executor types (both data_source and standalone).
 * Used by the UI to show the top-level tool creation options.
 */
export function getAllExecutorTypes(): Array<{
  executorType: ExecutorType;
  label: string;
  description: string;
  requiresDataSource: boolean;
}> {
  return [
    {
      executorType: 'data_source',
      label: 'Data Source',
      description: 'Operate on a connected data source (search, inspect, enumerate, lookup)',
      requiresDataSource: true,
    },
    ...STANDALONE_EXECUTORS.map((e) => ({
      executorType: e.executorType as ExecutorType,
      label: e.label,
      description: e.description,
      requiresDataSource: false,
    })),
  ];
}
