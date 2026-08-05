// src/features/public-api/public-api.openapi.ts
//
// Single source of truth for the PUBLIC v1 API's OpenAPI 3.1 description.
//
// Request bodies reuse the same Zod schemas the route handlers validate with
// (search-experience.schemas, ai-experience.validation) so the docs can never
// drift from what the server actually accepts. Response shapes are declared
// here because they're assembled ad-hoc in the handlers rather than parsed.
//
// Run `npm run openapi:generate` (see generate-openapi.ts) to emit the spec
// that the Docusaurus site renders.

import { z } from 'zod';
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';

import {
  publicSearchRequestSchema,
  autocompleteRequestSchema,
  summarizeAPIRequestSchema,
} from '@/features/search-experience/search-experience.schemas';
import { chatRequestSchema } from '@/features/ai-experience/ai-experience.validation';

// Augment Zod with `.openapi()` — must run before any schema gets metadata.
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// ============================================================================
// SECURITY SCHEMES
// ============================================================================

const ACCESS_TOKEN = 'AccessToken';
const BEARER = 'BearerAuth';
const INGEST_KEY = 'IngestApiKey';

registry.registerComponent('securitySchemes', ACCESS_TOKEN, {
  type: 'apiKey',
  in: 'header',
  name: 'X-Access-Token',
  description:
    'Per-experience access token. Find it in the dashboard under the Search or AI Experience’s "Access" tab.',
});

registry.registerComponent('securitySchemes', BEARER, {
  type: 'http',
  scheme: 'bearer',
  description: 'The same access token may be sent as `Authorization: Bearer <token>` instead of `X-Access-Token`.',
});

registry.registerComponent('securitySchemes', INGEST_KEY, {
  type: 'apiKey',
  in: 'header',
  name: 'X-Api-Key',
  description: 'Per-index ingestion API key, used only by the document ingestion endpoint.',
});

const tokenAuth = [{ [ACCESS_TOKEN]: [] }, { [BEARER]: [] }];

// ============================================================================
// SHARED RESPONSE SCHEMAS
// ============================================================================

const errorResponseSchema = z
  .object({
    success: z.literal(false).optional(),
    error: z.string().openapi({ example: 'Invalid access token' }),
    code: z.string().optional().openapi({ example: 'UNAUTHORIZED' }),
    details: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional()
      .openapi({ description: 'Per-field validation errors (present on 400 VALIDATION_ERROR).' }),
  })
  .openapi('ErrorResponse');

const paginationSchema = z
  .object({
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
    totalItems: z.number().int().optional(),
    hasNextPage: z.boolean().optional(),
    hasPreviousPage: z.boolean().optional(),
  })
  .openapi('Pagination');

const searchHitSchema = z
  .object({
    id: z.string(),
    score: z.number(),
    source: z.record(z.unknown()).openapi({ description: 'Indexed document fields (subject to field-level include/exclude config).' }),
    highlights: z.record(z.array(z.string())).optional(),
  })
  .openapi('SearchHit');

const facetSchema = z
  .object({
    field: z.string(),
    type: z.string(),
    label: z.string().optional(),
    buckets: z.array(z.object({ key: z.union([z.string(), z.number()]), count: z.number().int() })),
  })
  .openapi('Facet');

const searchResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.object({
      results: z.array(searchHitSchema),
      total: z.object({ value: z.number().int(), relation: z.string().optional() }),
      pagination: paginationSchema,
      facets: z.array(facetSchema).optional(),
      took: z.number().int().openapi({ description: 'Total round-trip time in milliseconds.' }),
      searchExperienceId: z.string().uuid(),
      indexesSearched: z.array(z.object({ id: z.string().uuid(), name: z.string(), displayName: z.string() })),
      displayConfig: z.record(z.unknown()).optional(),
    }),
  })
  .openapi('SearchResponse');

const autocompleteResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.object({
      suggestions: z.array(
        z.object({
          text: z.string(),
          score: z.number().optional(),
          field: z.string().optional(),
          indexId: z.string().optional(),
          indexName: z.string().optional(),
          highlight: z.string().optional(),
        }),
      ),
      query: z.string(),
      took: z.number().int().optional(),
    }),
  })
  .openapi('AutocompleteResponse');

const documentResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.object({
      document: z.object({
        id: z.string(),
        fields: z.record(z.unknown()),
        indexId: z.string(),
        indexName: z.string(),
      }),
      displayConfig: z.record(z.unknown()).optional(),
    }),
  })
  .openapi('DocumentResponse');

const widgetConfigResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.object({
      name: z.string(),
      greeting: z.string().optional(),
      description: z.string().optional(),
      suggestedQuestions: z.array(z.string()).optional(),
      placeholder: z.string().optional(),
      showBranding: z.boolean(),
    }),
  })
  .openapi('WidgetConfigResponse');

const embedSnippetResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.object({
      widget: z.enum(['chat', 'search']),
      experienceName: z.string(),
      scriptUrl: z.string().url(),
      containerId: z.string(),
      globalName: z.string(),
      appliedConfig: z.object({
        theme: z.string().nullable(),
        primaryColor: z.string().nullable(),
        launcher: z.string().nullable(),
        placement: z.string().nullable(),
      }),
      html: z.string().openapi({ description: 'Ready-to-paste HTML embed snippet.' }),
    }),
  })
  .openapi('EmbedSnippetResponse');

const ingestResponseSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        indexed: z.number().int().optional(),
        failed: z.number().int().optional(),
      })
      .openapi({ description: 'Ingestion outcome counts.' }),
  })
  .openapi('IngestResponse');

// SSE streams can't be fully modelled in OpenAPI; document the event envelope.
const sseDescription =
  'Server-Sent Events stream (`text/event-stream`). Each line is `data: <json>`. ' +
  'Event objects carry a `type` of `content` | `tool_call` | `tool_result` | `done` | `error`.';

// ============================================================================
// HELPERS
// ============================================================================

const json = (schema: z.ZodTypeAny) => ({ 'application/json': { schema } });

const errorResponse = (description: string) => ({
  description,
  content: json(errorResponseSchema),
});

// ============================================================================
// PATHS
// ============================================================================

registry.registerPath({
  method: 'post',
  path: '/api/v1/search',
  tags: ['Search'],
  summary: 'Run a search query',
  description: 'Executes a query against a Search Experience and returns ranked results, facets, and pagination.',
  security: tokenAuth,
  request: { body: { content: json(publicSearchRequestSchema.openapi('SearchRequest')) } },
  responses: {
    200: { description: 'Search results.', content: json(searchResponseSchema) },
    400: errorResponse('Invalid request body or no valid indexes configured.'),
    401: errorResponse('Missing or invalid access token.'),
    503: errorResponse('Search provider unavailable.'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/autocomplete',
  tags: ['Search'],
  summary: 'Autocomplete suggestions',
  description: 'Returns type-ahead suggestions for a partial query.',
  security: tokenAuth,
  request: { body: { content: json(autocompleteRequestSchema.openapi('AutocompleteRequest')) } },
  responses: {
    200: { description: 'Suggestions.', content: json(autocompleteResponseSchema) },
    401: errorResponse('Missing or invalid access token.'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/summarize',
  tags: ['AI'],
  summary: 'Summarize search results (streaming)',
  description:
    'Generates an AI summary over a set of search results. ' + sseDescription,
  security: tokenAuth,
  request: { body: { content: json(summarizeAPIRequestSchema.openapi('SummarizeRequest')) } },
  responses: {
    200: { description: 'SSE stream of summary content.', content: { 'text/event-stream': { schema: z.string() } } },
    401: errorResponse('Missing or invalid access token.'),
    403: errorResponse('AI summarization is not enabled for this experience.'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/documents/{documentId}',
  tags: ['Search'],
  summary: 'Fetch a document by ID',
  description: 'Returns a single document from the experience’s indexes, respecting field-level response config.',
  security: tokenAuth,
  request: {
    params: z.object({
      documentId: z.string().openapi({ param: { name: 'documentId', in: 'path' }, example: 'sku-12345' }),
    }),
  },
  responses: {
    200: { description: 'The document.', content: json(documentResponseSchema) },
    401: errorResponse('Missing or invalid access token.'),
    404: errorResponse('Document not found in any active index.'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/ai-experiences/chat',
  tags: ['AI'],
  summary: 'Chat with an AI Experience (streaming)',
  description:
    'Sends a user message to the AI Experience identified by the access token and streams the assistant response. ' +
    sseDescription,
  security: tokenAuth,
  request: { body: { content: json(chatRequestSchema.openapi('ChatRequest')) } },
  responses: {
    200: { description: 'SSE stream of the assistant turn.', content: { 'text/event-stream': { schema: z.string() } } },
    400: errorResponse('Invalid request body.'),
    401: errorResponse('Missing or invalid access token.'),
    403: errorResponse('AI Experience is not active.'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/ai-experiences/widget-config',
  tags: ['AI'],
  summary: 'Public widget configuration',
  description: 'Returns the greeting, suggested questions, and branding flags a chat widget needs before the first message.',
  security: tokenAuth,
  responses: {
    200: { description: 'Widget configuration.', content: json(widgetConfigResponseSchema) },
    401: errorResponse('Missing or invalid access token.'),
    403: errorResponse('AI Experience is not active.'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/embed-snippet',
  tags: ['Embed'],
  summary: 'Get the drop-in embed snippet',
  description: 'Returns a ready-to-paste HTML snippet (and resolved config) for the experience the token identifies.',
  security: tokenAuth,
  request: {
    query: z.object({
      containerId: z
        .string()
        .optional()
        .openapi({ param: { name: 'containerId', in: 'query' }, description: 'DOM id the widget mounts into.' }),
    }),
  },
  responses: {
    200: { description: 'Embed snippet and applied config.', content: json(embedSnippetResponseSchema) },
    401: errorResponse('Missing or invalid access token.'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/search-indexes/{id}/documents',
  tags: ['Ingestion'],
  summary: 'Ingest documents into an index',
  description:
    'Uploads documents for indexing from an external system. Authenticated with a per-index ingestion key (`X-Api-Key` or `Authorization: Bearer`).',
  security: [{ [INGEST_KEY]: [] }, { [BEARER]: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' }, description: 'Search index UUID.' }),
    }),
    body: {
      content: json(
        z
          .object({
            documents: z
              .array(z.record(z.unknown()))
              .min(1)
              .openapi({ description: 'Array of document objects to index.' }),
          })
          .openapi('IngestRequest'),
      ),
    },
  },
  responses: {
    200: { description: 'Ingestion accepted.', content: json(ingestResponseSchema) },
    400: errorResponse('Invalid payload.'),
    401: errorResponse('Missing or invalid ingestion key.'),
  },
});

// ============================================================================
// DOCUMENT BUILDER
// ============================================================================

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Interakt Public API',
      version: '1.0.0',
      description:
        'Public, token-authenticated REST API for embedding Interakt search and AI chat into your own applications.\n\n' +
        'All endpoints live under `/api/v1`. Authenticate with your experience’s access token via the `X-Access-Token` ' +
        'header (or `Authorization: Bearer`). Document ingestion uses a separate per-index `X-Api-Key`.',
    },
    servers: [{ url: 'https://admin.interakt.app', description: 'Hosted Interakt' }],
    tags: [
      { name: 'Search', description: 'Query indexes and fetch documents.' },
      { name: 'AI', description: 'AI summaries and chat experiences.' },
      { name: 'Embed', description: 'Drop-in widget embedding.' },
      { name: 'Ingestion', description: 'Push documents into an index.' },
    ],
  });
}
