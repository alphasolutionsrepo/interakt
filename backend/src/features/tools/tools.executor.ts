// src/features/tools/tools.executor.ts

/**
 * Hardened Tool Executor
 *
 * The single entry point for all tool executions in the platform.
 * Every tool call — whether from the agentic loop, structured pipeline,
 * or test panel — goes through this executor.
 *
 * Execution flow:
 * 1. Load tool from DB
 * 2. Validate input against inputSchema
 * 3. Resolve secret references in config
 * 4. Execute with timeout + retry + backoff
 * 5. Validate output against outputSchema
 * 6. On exhaustion, apply fallback strategy
 * 7. Full OTel tracing across entire lifecycle
 */

import { createLogger } from '@/shared/logger/logger';
import { withSpan, ATTR } from '@/features/telemetry';
import * as toolsService from './tools.service';
import * as secretsService from '@/features/secrets/secrets.service';
import { executeHttpApi } from './executors/http-api';
import { executeWebSearch } from './executors/web-search';
import { executeAiResponder } from './executors/ai-responder';
import {
  executeDataSourceSearch,
  executeDataSourceInspect,
  executeDataSourceEnumerate,
  executeDataSourceLookup,
} from './executors/data-source';
import { isMcpToolId, parseMcpToolId } from '@/features/mcp-connection/mcp-tool-resolver';
import { executeMcpTool } from '@/features/mcp-connection/mcp-executor';
import type { ToolRetryConfig, ToolFallbackConfig } from '@/db/schema/tools.schema';

const logger = createLogger('tool-executor');


// ============================================================================
// DEFAULT AI SCHEMAS (per executor type + operation)
// Single-purpose schemas — each tool does exactly one thing.
// Key format: "executorType" or "executorType:operation" for data_source tools.
// ============================================================================

export const EXECUTOR_INPUT_SCHEMAS: Record<string, object> = {
  'data_source:search': {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query string',
      },
      filters: {
        type: 'array',
        description: 'Filter constraints as field/operator/value triples',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'range'] },
            value: { type: 'string', description: 'Filter value. Use string for text, number as string for numeric comparisons, comma-separated for "in" operator.' },
          },
          required: ['field', 'operator', 'value'],
        },
      },
      sort: {
        type: 'string',
        description: 'Sort field and direction, e.g. "price:asc"',
      },
    },
    required: ['query'],
  },
  'data_source:inspect': {
    type: 'object',
    properties: {},
    required: [],
  },
  'data_source:enumerate': {
    type: 'object',
    properties: {
      field: {
        type: 'string',
        description: 'The field name to enumerate distinct values for',
      },
      maxValues: {
        type: 'integer',
        description: 'Maximum number of distinct values to return',
        minimum: 1,
        maximum: 200,
      },
    },
    required: ['field'],
  },
  'data_source:lookup': {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The unique identifier of the document to retrieve',
      },
    },
    required: ['id'],
  },
  http: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search or query string to send to the API',
      },
    },
    required: ['query'],
  },
  web_search: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The web search query',
      },
      maxResults: {
        type: 'integer',
        description: 'Maximum number of results to return (1–20)',
        minimum: 1,
        maximum: 20,
      },
    },
    required: ['query'],
  },
  ai_call: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'The input text or question to send to the AI responder',
      },
    },
    required: ['input'],
  },
};

export const EXECUTOR_OUTPUT_SCHEMAS: Record<string, object> = {
  'data_source:search': {
    type: 'object',
    properties: {
      results: { type: 'array', description: 'Ranked search results' },
      totalCount: { type: 'integer', description: 'Total matching documents' },
    },
  },
  'data_source:inspect': {
    type: 'object',
    properties: {
      fields: { type: 'array', description: 'Available fields with types and capabilities' },
    },
  },
  'data_source:enumerate': {
    type: 'object',
    properties: {
      field: { type: 'string', description: 'The field that was enumerated' },
      values: { type: 'array', description: 'Distinct values with counts' },
    },
  },
  'data_source:lookup': {
    type: 'object',
    properties: {
      document: { type: 'object', description: 'The retrieved document' },
    },
  },
};

// ============================================================================
// EXECUTION RESULT
// ============================================================================

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
  /** Number of retry attempts used (0 = first attempt succeeded) */
  retriesUsed?: number;
  /** Whether the fallback was used instead of the primary executor */
  fallbackUsed?: boolean;
  /** Whether the execution timed out */
  timedOut?: boolean;
}

// ============================================================================
// SECRET RESOLVER
// Recursively walks the config object and replaces all {{secret:name}} refs.
// ============================================================================

const SECRET_PATTERN = /\{\{secret:([a-z][a-z0-9_]*)\}\}/g;

async function resolveValue(val: unknown): Promise<unknown> {
  if (typeof val === 'string') {
    const matches = [...val.matchAll(SECRET_PATTERN)];
    if (matches.length === 0) return val;

    // Fetch all referenced secrets in parallel
    const resolved = await Promise.all(
      matches.map(async ([, name]) => {
        const secret = await secretsService.resolveSecret(name);
        return { placeholder: `{{secret:${name}}}`, secret };
      }),
    );

    let result = val;
    for (const { placeholder, secret } of resolved) {
      if (secret !== null) {
        result = result.replace(placeholder, secret);
      }
    }
    return result;
  }

  if (Array.isArray(val)) {
    return Promise.all(val.map(resolveValue));
  }

  if (val !== null && typeof val === 'object') {
    const entries = await Promise.all(
      Object.entries(val as Record<string, unknown>).map(async ([k, v]) => [
        k,
        await resolveValue(v),
      ]),
    );
    return Object.fromEntries(entries);
  }

  return val;
}

export async function resolveSecretRefs(
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return resolveValue(config) as Promise<Record<string, unknown>>;
}

// ============================================================================
// INPUT VALIDATOR
// Checks required fields against the tool's inputSchema (or type default).
// ============================================================================

function validateInput(
  input: Record<string, unknown>,
  schema: Record<string, unknown> | null,
): string | null {
  if (!schema) return null;
  const required = (schema.required as string[]) ?? [];
  for (const field of required) {
    if (input[field] === undefined || input[field] === null || input[field] === '') {
      return `Missing required field: "${field}"`;
    }
  }
  return null;
}

// ============================================================================
// OUTPUT VALIDATOR
// Checks required fields in the output against the tool's outputSchema.
// ============================================================================

function validateOutput(
  data: unknown,
  schema: Record<string, unknown> | null,
): string | null {
  if (!schema || data === undefined || data === null) return null;
  if (typeof data !== 'object') return null;

  const required = (schema.required as string[]) ?? [];
  const output = data as Record<string, unknown>;
  for (const field of required) {
    if (output[field] === undefined || output[field] === null) {
      return `Output missing required field: "${field}"`;
    }
  }
  return null;
}

// ============================================================================
// TIMEOUT WRAPPER
// ============================================================================

async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ToolTimeoutError(timeoutMs));
    }, timeoutMs);

    fn().then(
      (result) => { clearTimeout(timer); resolve(result); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

class ToolTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Tool execution timed out after ${timeoutMs}ms`);
    this.name = 'ToolTimeoutError';
  }
}

// ============================================================================
// RETRY WITH BACKOFF
// ============================================================================

function getBackoffMs(attempt: number, config: ToolRetryConfig): number {
  const baseMs = 500;
  if (config.backoff === 'linear') {
    return baseMs * attempt;
  }
  // exponential: 500, 1000, 2000, 4000...
  return baseMs * Math.pow(2, attempt - 1);
}

function isRetryable(error: unknown, config: ToolRetryConfig): boolean {
  if (error instanceof ToolTimeoutError) return true;

  const message = error instanceof Error ? error.message : String(error);

  // If retryableErrors is configured, only retry those
  if (config.retryableErrors?.length) {
    return config.retryableErrors.some(pattern =>
      message.toLowerCase().includes(pattern.toLowerCase()),
    );
  }

  // Default: retry on network/timeout errors, not on validation errors
  const retryablePatterns = [
    'timeout', 'econnrefused', 'econnreset', 'enotfound',
    'socket hang up', 'network', 'fetch failed', '503', '502', '429',
  ];
  return retryablePatterns.some(p => message.toLowerCase().includes(p));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// FALLBACK EXECUTOR
// ============================================================================

function executeFallback(
  config: ToolFallbackConfig,
  error: Error,
): Omit<ToolExecutionResult, 'durationMs'> {
  switch (config.type) {
    case 'default_response':
      return {
        success: true,
        data: config.config.response ?? { message: 'Default response (tool unavailable)' },
        fallbackUsed: true,
      };

    case 'error_message': {
      const message = (config.config.message as string)
        ?? `Tool is currently unavailable: ${error.message}`;
      return {
        success: false,
        error: message,
        fallbackUsed: true,
      };
    }

    case 'skip':
      return {
        success: true,
        data: null,
        fallbackUsed: true,
      };

    case 'alternative_tool':
      // Alternative tool execution would be handled by the caller
      // (e.g., the pipeline step) since it requires loading another tool.
      // We return a marker so the caller knows to try the alternative.
      return {
        success: false,
        error: `Primary tool failed, alternative tool suggested: ${config.config.toolId ?? 'unknown'}`,
        fallbackUsed: true,
      };

    default:
      return {
        success: false,
        error: error.message,
        fallbackUsed: true,
      };
  }
}

// ============================================================================
// EXECUTOR DISPATCH (new model: executorType + operation)
// ============================================================================

async function dispatchByExecutor(
  executorType: string,
  operation: string | null,
  dataSourceId: string | null,
  resolvedConfig: Record<string, unknown>,
  input: Record<string, unknown>,
): Promise<Omit<ToolExecutionResult, 'durationMs'>> {
  switch (executorType) {
    case 'data_source': {
      if (!dataSourceId) {
        return { success: false, error: 'data_source executor requires a dataSourceId' };
      }
      switch (operation) {
        case 'search':
          return executeDataSourceSearch(dataSourceId, resolvedConfig, input);
        case 'inspect':
          return executeDataSourceInspect(dataSourceId, resolvedConfig, input);
        case 'enumerate':
          return executeDataSourceEnumerate(dataSourceId, resolvedConfig, input);
        case 'lookup':
          return executeDataSourceLookup(dataSourceId, resolvedConfig, input);
        default:
          return { success: false, error: `Unknown data source operation: '${operation}'` };
      }
    }
    case 'http':
      return executeHttpApi(resolvedConfig, input);
    case 'web_search':
      return executeWebSearch(resolvedConfig, input);
    case 'ai_call':
      return executeAiResponder(resolvedConfig, input);
    default:
      return { success: false, error: `Unknown executor type: '${executorType}'` };
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Execute a tool with full hardening:
 * - Input validation
 * - Secret resolution
 * - Timeout enforcement
 * - Retry with backoff
 * - Fallback on exhaustion
 * - Output validation
 * - OTel tracing
 */
export async function executeTool(
  toolId: string,
  input: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const start = Date.now();

  // 0. MCP tools take a separate path. They are virtual — no row in the
  //    `tools` table — and identified by a synthetic `mcp:<conn>:<name>` id.
  //    We still record a `tool.execute` span (with size/token attrs so
  //    context bloat shows up in traces) but skip retry/fallback/validation
  //    since the MCP server already owns the input schema contract.
  if (isMcpToolId(toolId)) {
    const parsed = parseMcpToolId(toolId);
    return withSpan(
      {
        name: 'tool.execute',
        attributes: {
          [ATTR.TOOL_ID]: toolId,
          [ATTR.TOOL_NAME]: parsed?.toolName ?? toolId,
          [ATTR.TOOL_TYPE]: 'mcp',
        },
      },
      async (span) => {
        span.setAttribute('tool.executor_type', 'mcp');
        try {
          const inputStr = JSON.stringify(input);
          span.setAttribute(ATTR.TOOL_INPUT_PARAMS, inputStr.length > 2000 ? inputStr.slice(0, 2000) + '…' : inputStr);
        } catch { /* skip */ }

        const result = await executeMcpTool(toolId, input);
        const durationMs = Date.now() - start;

        span.setAttribute(ATTR.TOOL_SUCCESS, result.success);
        span.setAttribute(ATTR.TOOL_DURATION_MS, durationMs);

        // Record the size of what's about to be fed back to the LLM. MCP
        // servers can return enormous payloads (full wiki pages, etc.); this
        // surfaces context bloat in the trace before the next LLM call hits
        // a TPM or context-length limit.
        try {
          const serialized = JSON.stringify(result.data ?? null);
          const sizeChars = serialized.length;
          span.setAttribute(ATTR.TOOL_RESULT_SIZE_CHARS, sizeChars);
          span.setAttribute(ATTR.TOOL_RESULT_EST_TOKENS, Math.ceil(sizeChars / 4));
        } catch { /* non-serializable result — skip */ }

        return { ...result, durationMs };
      },
    );
  }

  // 1. Load tool
  const tool = await toolsService.getToolById(toolId);
  if (!tool) {
    return { success: false, error: 'Tool not found', durationMs: Date.now() - start };
  }
  if (!tool.isActive) {
    return { success: false, error: 'Tool is not active', durationMs: Date.now() - start };
  }

  // 2. Determine executor type and schema key
  const executorType = tool.executorType;
  const operation = tool.operation ?? null;
  const schemaKey = operation ? `${executorType}:${operation}` : executorType;

  // 3. Execute within OTel span
  return withSpan(
    {
      name: 'tool.execute',
      attributes: {
        [ATTR.TOOL_ID]: tool.id,
        [ATTR.TOOL_NAME]: tool.name,
        [ATTR.TOOL_SLUG]: tool.slug,
        [ATTR.TOOL_TYPE]: `${executorType}${operation ? ':' + operation : ''}`,
      },
    },
    async (span) => {
      span.setAttribute('tool.executor_type', executorType);
      if (operation) span.setAttribute('tool.operation', operation);

      // 4. Validate input
      const inputSchema =
        (tool.inputSchema as Record<string, unknown> | null | undefined) ??
        (EXECUTOR_INPUT_SCHEMAS[schemaKey] as Record<string, unknown> | undefined) ??
        null;

      const inputError = validateInput(input, inputSchema);
      if (inputError) {
        span.setAttribute(ATTR.TOOL_INPUT_VALID, false);
        span.setAttribute(ATTR.TOOL_SUCCESS, false);
        return { success: false, error: inputError, durationMs: Date.now() - start };
      }
      span.setAttribute(ATTR.TOOL_INPUT_VALID, true);

      // Record input parameters for trace debugging (truncated to avoid bloat)
      try {
        const inputStr = JSON.stringify(input);
        span.setAttribute(ATTR.TOOL_INPUT_PARAMS, inputStr.length > 2000 ? inputStr.slice(0, 2000) + '…' : inputStr);
      } catch { /* skip if not serializable */ }

      // 5. Resolve secret references in config
      const configSource = (tool.executorConfig as Record<string, unknown> | null) ?? {};
      const resolvedConfig = await resolveSecretRefs(configSource);

      // 6. Execute with retry + timeout
      const retryConfig = (tool.retryConfig as ToolRetryConfig) ?? { count: 2, backoff: 'exponential' };
      const timeoutMs = tool.timeout ?? 30_000;
      const maxAttempts = 1 + retryConfig.count; // 1 initial + N retries

      let lastError: Error | null = null;
      let attempt = 0;

      for (attempt = 1; attempt <= maxAttempts; attempt++) {
        span.setAttribute(ATTR.TOOL_ATTEMPT, attempt);

        try {
          const result = await executeWithTimeout(
            () => dispatchByExecutor(executorType, operation, tool.dataSourceId, resolvedConfig, input),
            timeoutMs,
          ) as Omit<ToolExecutionResult, 'durationMs'>;

          if (!result.success) {
            // Executor returned an error (not thrown) — treat as non-retryable
            const durationMs = Date.now() - start;
            span.setAttribute(ATTR.TOOL_SUCCESS, false);
            span.setAttribute(ATTR.TOOL_DURATION_MS, durationMs);
            span.setAttribute(ATTR.TOOL_RETRIES, attempt - 1);
            return { ...result, durationMs, retriesUsed: attempt - 1 };
          }

          // 7. Validate output
          const outputSchema =
            (tool.outputSchema as Record<string, unknown> | null | undefined) ??
            (EXECUTOR_OUTPUT_SCHEMAS[schemaKey] as Record<string, unknown> | undefined) ??
            null;

          const outputError = validateOutput(result.data, outputSchema);
          if (outputError) {
            span.setAttribute(ATTR.TOOL_OUTPUT_VALID, false);
            logger.warn('Tool output validation failed', {
              toolId: tool.id, toolSlug: tool.slug, error: outputError,
            });
          } else {
            span.setAttribute(ATTR.TOOL_OUTPUT_VALID, true);
          }

          // Record result counts as span attributes
          const resultData = result.data as Record<string, unknown> | undefined;
          if (resultData) {
            if (Array.isArray(resultData.results)) {
              span.setAttribute(ATTR.TOOL_RESULT_COUNT, (resultData.results as unknown[]).length);
            }
            if (typeof resultData.totalCount === 'number') {
              span.setAttribute(ATTR.TOOL_TOTAL_COUNT, resultData.totalCount);
            }
          }

          // Record the size of the result that will be fed back to the LLM.
          // MCP servers (e.g. DeepWiki) and unbounded RAG can return enormous
          // payloads — surfacing chars/tokens here makes context-bloat visible
          // in the trace UI before the next LLM call rate-limits.
          try {
            const serialized = JSON.stringify(result.data ?? null);
            const sizeChars = serialized.length;
            span.setAttribute(ATTR.TOOL_RESULT_SIZE_CHARS, sizeChars);
            span.setAttribute(ATTR.TOOL_RESULT_EST_TOKENS, Math.ceil(sizeChars / 4));
          } catch { /* non-serializable result — skip */ }

          // Success
          const durationMs = Date.now() - start;
          span.setAttribute(ATTR.TOOL_SUCCESS, true);
          span.setAttribute(ATTR.TOOL_DURATION_MS, durationMs);
          span.setAttribute(ATTR.TOOL_RETRIES, attempt - 1);
          return { ...result, durationMs, retriesUsed: attempt - 1 };

        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const timedOut = error instanceof ToolTimeoutError;

          if (timedOut) {
            span.setAttribute(ATTR.TOOL_TIMED_OUT, true);
          }

          logger.warn('Tool execution attempt failed', {
            toolId: tool.id,
            toolSlug: tool.slug,
            attempt,
            maxAttempts,
            timedOut,
            error: lastError.message,
          });

          // Check if retryable and we have attempts left
          if (attempt < maxAttempts && isRetryable(error, retryConfig)) {
            const backoffMs = getBackoffMs(attempt, retryConfig);
            span.addEvent('tool.retry', {
              attempt,
              backoff_ms: backoffMs,
              error: lastError.message,
            });
            await sleep(backoffMs);
            continue;
          }

          // No more retries
          break;
        }
      }

      // 7. All attempts exhausted — try fallback
      const retriesUsed = attempt - 1;
      const fallbackConfig = tool.fallbackConfig as ToolFallbackConfig | null | undefined;

      if (fallbackConfig) {
        span.setAttribute(ATTR.TOOL_FALLBACK_USED, true);
        span.setAttribute(ATTR.TOOL_FALLBACK_TYPE, fallbackConfig.type);

        logger.info('Tool using fallback', {
          toolId: tool.id, toolSlug: tool.slug,
          fallbackType: fallbackConfig.type,
          retriesUsed,
        });

        const fallbackResult = executeFallback(fallbackConfig, lastError!);
        const durationMs = Date.now() - start;
        span.setAttribute(ATTR.TOOL_SUCCESS, fallbackResult.success);
        span.setAttribute(ATTR.TOOL_DURATION_MS, durationMs);
        span.setAttribute(ATTR.TOOL_RETRIES, retriesUsed);

        return {
          ...fallbackResult,
          durationMs,
          retriesUsed,
          timedOut: lastError instanceof ToolTimeoutError,
        };
      }

      // No fallback — return the error
      const durationMs = Date.now() - start;
      span.setAttribute(ATTR.TOOL_SUCCESS, false);
      span.setAttribute(ATTR.TOOL_DURATION_MS, durationMs);
      span.setAttribute(ATTR.TOOL_RETRIES, retriesUsed);
      span.setAttribute(ATTR.TOOL_FALLBACK_USED, false);

      return {
        success: false,
        error: lastError?.message ?? 'Unexpected error during tool execution',
        durationMs,
        retriesUsed,
        timedOut: lastError instanceof ToolTimeoutError,
      };
    },
  );
}
