// src/features/mcp-connection/mcp-tool-resolver.ts

/**
 * Synthetic identifier helpers for MCP-sourced tools.
 *
 * MCP tools are never persisted as rows in the `tools` table. Instead, at
 * runtime we materialize them as ephemeral ToolDefinitions and identify each
 * one by an opaque string of the form:
 *
 *     mcp:<connection-id>:<mcp-tool-name>
 *
 * The tool *executor* recognizes this prefix and routes to a dedicated MCP
 * dispatcher (see mcp-executor.ts) instead of doing the usual DB load.
 *
 * The *LLM-facing* name (which appears in function-calling APIs) is a
 * grouped form like `mcp__<connection-slug>__<sanitized-tool-name>` so the
 * model can see which connection a tool belongs to in its function list.
 */

export const MCP_TOOL_ID_PREFIX = 'mcp:';

/** Build the synthetic toolId we route on at execution time. */
export function buildMcpToolId(connectionId: string, toolName: string): string {
  return `${MCP_TOOL_ID_PREFIX}${connectionId}:${toolName}`;
}

/** Parse a synthetic id back into its components. Returns null if not an MCP id. */
export function parseMcpToolId(toolId: string): { connectionId: string; toolName: string } | null {
  if (!toolId.startsWith(MCP_TOOL_ID_PREFIX)) return null;
  const rest = toolId.slice(MCP_TOOL_ID_PREFIX.length);
  const firstColon = rest.indexOf(':');
  if (firstColon === -1) return null;
  const connectionId = rest.slice(0, firstColon);
  const toolName = rest.slice(firstColon + 1);
  if (!connectionId || !toolName) return null;
  return { connectionId, toolName };
}

export function isMcpToolId(toolId: string): boolean {
  return toolId.startsWith(MCP_TOOL_ID_PREFIX);
}

/**
 * Build a function-name-safe identifier the LLM will see.
 *   "atlassian-jira" + "createIssue" → "mcp__atlassian_jira__createIssue"
 * Non-identifier characters become underscores. Must match
 * `/^[a-zA-Z_][a-zA-Z0-9_]*$/` for OpenAI / Anthropic function-calling.
 */
export function buildLlmFacingName(connectionSlug: string, toolName: string): string {
  const safeSlug = sanitize(connectionSlug);
  const safeTool = sanitize(toolName);
  return `mcp__${safeSlug}__${safeTool}`;
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_');
}
