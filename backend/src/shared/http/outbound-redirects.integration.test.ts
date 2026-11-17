// src/shared/http/outbound-redirects.integration.test.ts

/**
 * Server calls to addresses the admin set (an AI provider, an external search source, an MCP
 * server, the web search tool) follow redirects only on the same server. Two local servers stand in:
 * one redirects every request to the other, which records what reaches it. Nothing may: not
 * the request's headers (an API key in a custom header), nor its body.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/features/secrets/secrets.service', () => ({ resolveSecret: async () => 'stored-secret' }));

import { OllamaAdapter } from '@/features/ai-service/adapters/ollama.adapter';
import { OpenAIAdapter } from '@/features/ai-service/adapters/openai.adapter';
import { AdapterError } from '@/features/ai-service/adapters/types';
import { sitecoreSearchConnector } from '@/features/data-source/external-search/connectors/sitecore-search.connector';
import { callAzureAISearch } from '@/features/data-source/external-search/engines/azure-ai-search';
import { callElasticsearchSearch } from '@/features/data-source/external-search/engines/elasticsearch';
import { probeAndDiscover } from '@/features/mcp-connection/mcp-client';
import { executeWebSearch } from '@/features/tools/executors/web-search';

type Seen = { method?: string; path?: string; headers: http.IncomingHttpHeaders; body: string };
let reached: Seen[] = [];
let redirects = 0;
let redirectorUrl = '';
let catcherUrl = '';
let redirector: http.Server;
let catcher: http.Server;

const listen = (server: http.Server) => new Promise<string>((resolve) =>
  server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));

beforeAll(async () => {
  catcher = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      reached.push({ method: req.method, path: req.url, headers: req.headers, body });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  catcherUrl = await listen(catcher);
  redirector = http.createServer((req, res) => {
    redirects++;
    // A 307 keeps the method and body: what would reach the other server is the whole request
    res.writeHead(307, { location: `${catcherUrl}${req.url}` });
    res.end();
  });
  redirectorUrl = await listen(redirector);
});
afterAll(() => { redirector.close(); catcher.close(); });
beforeEach(() => { reached = []; redirects = 0; });

const adapterConfig = () => ({ baseUrl: `${redirectorUrl}/v1`, apiKey: 'provider-key', modelKey: 'm', timeout: 5000, settings: {} });
const request = { messages: [{ role: 'user' as const, content: 'a visitor question' }] };

describe('a redirect to another server', () => {
  it('is refused for an OpenAI-compatible provider: no retry, and nothing reaches the other server', async () => {
    const error = await new OpenAIAdapter().chat(request, adapterConfig()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdapterError);
    expect(error).toMatchObject({ retryable: false, message: expect.stringMatching(/redirected to another server/) });
    expect(redirects).toBe(1);
    expect(reached).toEqual([]);
  });

  it('is refused for an Ollama provider with a key', async () => {
    const error = await new OllamaAdapter().generateText({ prompt: 'a visitor question' }, adapterConfig()).catch((e: unknown) => e);
    expect(error).toMatchObject({ retryable: false, message: expect.stringMatching(/redirected to another server/) });
    expect(reached).toEqual([]);
  });

  it('is refused for an external Azure AI Search source (its key is a custom header), and said plainly', async () => {
    const result = await callAzureAISearch({ endpoint: redirectorUrl, indexName: 'products', apiKey: 'azure-key' }, { query: 'a visitor question', maxResults: 5 } as never);
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/^Azure AI Search: The server redirected to another server/) });
    expect(redirects).toBe(1);
    expect(reached).toEqual([]);
  });

  it('is refused for an external Elasticsearch source', async () => {
    const result = await callElasticsearchSearch({ endpoint: redirectorUrl, indexName: 'products', apiKey: 'es-key' }, { query: 'a visitor question', maxResults: 5 } as never);
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/^Elasticsearch: The server redirected to another server/) });
    expect(reached).toEqual([]);
  });

  it('is refused for a Sitecore Search source', async () => {
    const connection = { provider: 'sitecore-search', endpoint: `${redirectorUrl}/discover/v2/1`, indexName: 'rfk_widget', apiKey: 'sc-key', authType: 'api_key' as const, providerSettings: {} };
    await expect(sitecoreSearchConnector.search(connection, { query: 'a visitor question', offset: 0, limit: 5 } as never))
      .rejects.toThrow(/^Sitecore Search: The server redirected to another server/);
    expect(reached).toEqual([]);
  });

  it('is refused for an MCP server with a header key', async () => {
    const error = await probeAndDiscover({
      serverUrl: `${redirectorUrl}/mcp`, transport: 'streamable-http', timeoutMs: 5000,
      authConfig: { type: 'header', headerName: 'X-Api-Key', secretRef: 'mcp-key' } as never,
    }).catch((e: unknown) => e);
    expect(error).toMatchObject({ message: expect.stringMatching(/redirected to another server/) });
    expect(reached).toEqual([]);
  });
});

describe('the web search tool', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('does not follow its service to another server', async () => {
    // Its service's address is fixed, so the answer is stubbed: a redirect to another server
    const fetchMock = vi.fn(async () => new Response(null, { status: 307, headers: { location: `${catcherUrl}/search` } }));
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await executeWebSearch({ apiKeySecret: 'web-key' }, { query: 'a visitor question' });
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/redirected to another server/) });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]).toEqual([expect.any(String), expect.objectContaining({ redirect: 'manual' })]);
  });
});
