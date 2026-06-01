// src/features/mcp-connection/mcp-executor.ts

/**
 * MCP tool execution path.
 *
 * Invoked from tools.executor when it detects a synthetic `mcp:` toolId.
 * Looks up the connection, dispatches the call over MCP transport, and
 * returns a normalized result that matches the {success, data, error} shape
 * that the rest of the tool pipeline expects.
 */

import { createLogger } from '@/shared/logger/logger';
import * as repository from './mcp-connection.repository';
import { callTool, normalizeToolResult } from './mcp-client';
import { parseMcpToolId } from './mcp-tool-resolver';

const logger = createLogger('mcp-executor');

export interface McpExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export async function executeMcpTool(toolId: string, input: Record<string, unknown>): Promise<McpExecutionResult> {
  const parsed = parseMcpToolId(toolId);
  if (!parsed) {
    return { success: false, error: `Invalid MCP tool id: ${toolId}` };
  }

  const conn = await repository.getById(parsed.connectionId);
  if (!conn) {
    return { success: false, error: `MCP connection not found: ${parsed.connectionId}` };
  }
  if (!conn.isActive) {
    return { success: false, error: `MCP connection "${conn.slug}" is not active` };
  }

  try {
    const raw = await callTool(
      {
        serverUrl: conn.serverUrl,
        transport: conn.transport as 'streamable-http' | 'sse',
        authConfig: conn.authConfig,
      },
      parsed.toolName,
      input,
    );
    const normalized = normalizeToolResult(raw);

    if (normalized.isError) {
      return { success: false, error: normalized.text || 'MCP tool returned an error' };
    }

    return {
      success: true,
      data: normalized.structured !== undefined
        ? { result: normalized.structured, text: normalized.text }
        : { text: normalized.text },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'MCP tool execution failed';
    logger.warn('MCP tool call failed', {
      connectionId: parsed.connectionId,
      toolName: parsed.toolName,
      message,
    });
    return { success: false, error: message };
  }
}
