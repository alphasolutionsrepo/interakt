// src/features/mcp-connection/mcp-client.missing-secret.test.ts

/**
 * An MCP connection whose auth names a secret the vault can't give: the call fails naming the
 * secret and nothing is sent, instead of calling the server without its credentials.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchOnSameServer } = vi.hoisted(() => ({ fetchOnSameServer: vi.fn() }));
vi.mock('@/shared/http/same-server-fetch', () => ({ fetchOnSameServer }));
vi.mock('@/features/secrets/secrets.service', () => ({
  resolveSecret: vi.fn(async (name: string) => (name === 'mcp_token' ? 'tok-123' : null)),
}));

import { callTool, probeAndDiscover } from './mcp-client';

const reply = (result: unknown) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { headers: { 'content-type': 'application/json' } });

const connection = (secretRef: string) => ({
  serverUrl: 'https://mcp.example.com/mcp',
  transport: 'streamable-http' as const,
  authConfig: { type: 'bearer' as const, secretRef },
});

beforeEach(() => {
  fetchOnSameServer.mockReset();
  fetchOnSameServer.mockImplementation(async () => reply({ content: [], tools: [], protocolVersion: 'x' }));
});

describe('an MCP connection with an auth secret', () => {
  it('fails a tool call naming the missing secret, and sends nothing', async () => {
    await expect(callTool(connection('gone_token'), 'search', {})).rejects.toThrow(
      'The secret "gone_token" used for this connection\'s authentication is missing from the Secrets Vault or can\'t be read',
    );
    expect(fetchOnSameServer).not.toHaveBeenCalled();
  });

  it('fails discovery naming the missing secret, and sends nothing', async () => {
    await expect(probeAndDiscover(connection('gone_token'))).rejects.toThrow('"gone_token"');
    expect(fetchOnSameServer).not.toHaveBeenCalled();
  });

  it('sends the Authorization header when the vault has the secret', async () => {
    await callTool(connection('mcp_token'), 'search', {});
    const headers = fetchOnSameServer.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-123');
  });
});
