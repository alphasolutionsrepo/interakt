// src/features/mcp-connection/mcp-client.ts

/**
 * Minimal Model Context Protocol (MCP) client.
 *
 * Implements the streamable-http transport (the modern HTTP+SSE replacement
 * defined in the 2025-03-26 spec). Each request is a JSON-RPC POST that the
 * server answers either as a single JSON body or as a single SSE `message`
 * event — both are parsed transparently.
 *
 * Stateless by default: we don't track session IDs across calls, which works
 * for every public MCP server we've tested (DeepWiki, Context7, GitMCP). If
 * a server requires session continuity it can be added later by threading
 * the `mcp-session-id` header through the calls.
 */

import { createLogger } from '@/shared/logger/logger';
import { resolveSecret } from '@/features/secrets/secrets.service';
import type { McpAuthConfig, DiscoveredMcpTool, DiscoveredToolCatalog } from '@/db/schema/mcp-connections.schema';

const logger = createLogger('mcp-client');

const PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = { name: 'interakt', version: '0.1.0' };
const DEFAULT_TIMEOUT_MS = 30_000;

// ============================================================================
// TYPES
// ============================================================================

export interface McpClientConfig {
  serverUrl: string;
  transport: 'streamable-http' | 'sse';
  authConfig?: McpAuthConfig | null;
  timeoutMs?: number;
}

export interface InitializeResult {
  protocolVersion: string;
  serverInfo?: { name?: string; version?: string };
  capabilities?: Record<string, unknown>;
  instructions?: string;
}

export interface McpToolCallResult {
  content?: Array<{ type: string; text?: string; [k: string]: unknown }>;
  structuredContent?: unknown;
  isError?: boolean;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number | string;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

// ============================================================================
// AUTH HEADER RESOLUTION
// ============================================================================

async function buildAuthHeaders(authConfig?: McpAuthConfig | null): Promise<Record<string, string>> {
  if (!authConfig || authConfig.type === 'none') return {};
  if (!authConfig.secretRef) return {};

  const token = await resolveSecret(authConfig.secretRef);
  if (!token) {
    logger.warn('MCP auth secret could not be resolved', { secretRef: authConfig.secretRef });
    return {};
  }

  if (authConfig.type === 'bearer') {
    return { Authorization: `Bearer ${token}` };
  }
  if (authConfig.type === 'header' && authConfig.headerName) {
    return { [authConfig.headerName]: token };
  }
  return {};
}

// ============================================================================
// SSE / JSON RESPONSE PARSER
// ============================================================================

/**
 * MCP streamable-http responses arrive as either:
 *   1. application/json — body is a single JSON-RPC response
 *   2. text/event-stream — body contains one or more SSE events; we extract
 *      the first `event: message` with a JSON-RPC payload matching our id
 */
function parseMcpResponse<T>(contentType: string, body: string, expectedId: number | string): JsonRpcResponse<T> {
  if (contentType.includes('application/json')) {
    return JSON.parse(body) as JsonRpcResponse<T>;
  }

  if (contentType.includes('text/event-stream')) {
    // Lines beginning with "data:" carry the JSON-RPC payload.
    const lines = body.split('\n');
    for (const line of lines) {
      const trimmed = line.trimStart();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;
      try {
        const parsed = JSON.parse(payload) as JsonRpcResponse<T>;
        if (parsed.id === expectedId || parsed.id === String(expectedId) || parsed.id === Number(expectedId)) {
          return parsed;
        }
      } catch {
        // Skip non-JSON data frames (e.g., keep-alives)
      }
    }
    throw new Error('MCP SSE response contained no JSON-RPC payload matching the request id');
  }

  // Fallback: try JSON anyway
  try {
    return JSON.parse(body) as JsonRpcResponse<T>;
  } catch {
    throw new Error(`Unexpected MCP response content-type: ${contentType}`);
  }
}

// ============================================================================
// JSON-RPC CALL
// ============================================================================

async function rpcCall<T>(
  config: McpClientConfig,
  method: string,
  params: Record<string, unknown> | undefined,
  id: number,
): Promise<T> {
  const request: JsonRpcRequest = { jsonrpc: '2.0', id, method };
  if (params !== undefined) request.params = params;

  const authHeaders = await buildAuthHeaders(config.authConfig);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(config.serverUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': PROTOCOL_VERSION,
        ...authHeaders,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`MCP HTTP ${response.status} from ${config.serverUrl}: ${text.slice(0, 200)}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    const body = await response.text();
    const parsed = parseMcpResponse<T>(contentType, body, id);

    if (parsed.error) {
      throw new Error(`MCP JSON-RPC error ${parsed.error.code}: ${parsed.error.message}`);
    }
    if (parsed.result === undefined) {
      throw new Error(`MCP response missing result for method ${method}`);
    }
    return parsed.result;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Probe the MCP server: initialize + tools/list in a single sequence.
 * Returns the discovered tool catalog plus server info — exactly what we
 * need to populate `mcp_connections.discovered_tools` and gate health.
 */
export async function probeAndDiscover(config: McpClientConfig): Promise<DiscoveredToolCatalog> {
  const initResult = await rpcCall<InitializeResult>(config, 'initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: CLIENT_INFO,
  }, 1);

  const toolsResult = await rpcCall<{ tools: DiscoveredMcpTool[] }>(config, 'tools/list', undefined, 2);

  const tools = (toolsResult.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    outputSchema: t.outputSchema,
  }));

  return {
    tools,
    serverInfo: initResult.serverInfo,
    protocolVersion: initResult.protocolVersion,
  };
}

/**
 * Invoke a tool on the MCP server.
 * Returns the raw MCP result (content blocks + optional structuredContent).
 */
export async function callTool(
  config: McpClientConfig,
  toolName: string,
  toolArgs: Record<string, unknown>,
): Promise<McpToolCallResult> {
  return rpcCall<McpToolCallResult>(config, 'tools/call', {
    name: toolName,
    arguments: toolArgs,
  }, Date.now());
}

/**
 * Reduce an MCP tool result to a JSON-serializable shape that downstream
 * code (LLM tool_result blocks, observability) can render as plain text.
 *
 * Preference order:
 *   1. structuredContent — server signaled this is the canonical shape
 *   2. concatenated text blocks
 *   3. raw content array
 */
export function normalizeToolResult(result: McpToolCallResult): {
  text: string;
  structured?: unknown;
  isError: boolean;
} {
  const isError = result.isError === true;

  if (result.structuredContent !== undefined) {
    const structured = result.structuredContent;
    const text = typeof structured === 'string' ? structured : JSON.stringify(structured);
    return { text, structured, isError };
  }

  if (Array.isArray(result.content)) {
    const textParts = result.content
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string);
    if (textParts.length > 0) {
      return { text: textParts.join('\n'), isError };
    }
    return { text: JSON.stringify(result.content), isError };
  }

  return { text: '', isError };
}
