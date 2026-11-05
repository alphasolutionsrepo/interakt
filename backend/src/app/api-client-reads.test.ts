// src/app/api-client-reads.test.ts

/**
 * The admin's API clients and fetchers read an answer through handleApiResponse: a
 * gateway's error page (HTML) gives a readable ApiError with its status, not "Unexpected
 * token <"; the API's own error keeps its message, hint and request id; a success comes
 * back in the shape the pages use.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { aiExperiencesApi } from './ai-experiences/_lib/api-client';
import { loadExperienceOptions } from './analytics/_lib/experience-options';
import { fetchAnalytics } from './analytics/_lib/hooks/useAnalytics';
import { fetchChatSession, fetchChatSessions } from './analytics/_lib/hooks/useAnalyticsChat';
import { tracesApi } from './analytics/traces/_lib/api-client';
import { fetchHome } from './dashboard/_lib/useHome';
import { dataSourcesApi } from './data-sources/_lib/api-client';
import { healthApi } from './health/_lib/api-client';
import { jobsApi } from './jobs/_lib/api-client';
import { mcpConnectionsApi } from './mcp-connections/_lib/api-client';
import { aiServiceApi } from './playground/ai-service/_lib/api-client';
import { searchExperiencesApi } from './search-experiences/_lib/api-client';
import { secretsApi } from './secrets/_lib/api-client';
import { globalSearchSettingsApi } from './settings/search/_lib/api-client';
import { toolsApi } from './tools/_lib/api-client';

import { fetchEmbedSnippet } from '@/features/embed/fetch-embed-snippet';
import { DocsSearchUnavailableError, loadDocList, searchDocs } from '@/shared/help/docs-search';
import { answerWith, apiErrorResponse, apiSuccess, expectApiError, expectGatewayError, gatewayErrorPage } from '@/shared/test/api-responses';
import { providerChoicesQuery, resolvedDefaultsQuery } from '@/shared/ui/custom/provider-model-queries';

afterEach(() => { vi.unstubAllGlobals(); });

const page = { page: 1, pageSize: 20, totalPages: 1, totalItems: 1 };
const item = { id: 'a1', name: 'Alder' };

/** A client call, the success the API sends it, and what the call returns from it */
const READS: Array<[string, () => Promise<unknown>, () => Response, unknown]> = [
  ['tools list', () => toolsApi.list(), () => apiSuccess([item], { pagination: page }), { tools: [item], pagination: page }],
  ['active tools', () => toolsApi.getAllActive(), () => apiSuccess([item]), [item]],
  ['MCP connections list', () => mcpConnectionsApi.list(), () => apiSuccess([item], { pagination: page }), { connections: [item], pagination: page }],
  ['AI experiences list', () => aiExperiencesApi.list(), () => apiSuccess([item], { pagination: page }), { experiences: [item], pagination: page }],
  ['search experiences list', () => searchExperiencesApi.list(), () => apiSuccess([item], { pagination: page }), { items: [item], pagination: page }],
  ['data sources list', () => dataSourcesApi.list(), () => apiSuccess([item], { pagination: page }), { dataSources: [item], pagination: page }],
  ['secrets list', () => secretsApi.list(), () => apiSuccess([item]), [item]],
  ['traces list', () => tracesApi.list({ preset: '24h' }), () => apiSuccess([item], { pagination: page }), { spans: [item], pagination: page }],
  ['one span', () => tracesApi.getById('s1'), () => apiSuccess(item), item],
  ['a trace', () => tracesApi.getTraceSpans('t1'), () => apiSuccess([item]), [item]],
  ['trace metrics', () => tracesApi.getMetrics({ preset: '24h' }), () => apiSuccess({ totalSpans: 3 }), { totalSpans: 3 }],
  ['delete all traces', () => tracesApi.deleteAll(), () => apiSuccess({ deleted: true, count: 3 }), { deleted: true, count: 3 }],
  ['jobs list', () => jobsApi.listJobs(), () => apiSuccess([item]), [item]],
  ['job schedules', () => jobsApi.getSchedules(), () => apiSuccess([item]), [item]],
  ['search settings', () => globalSearchSettingsApi.get(), () => apiSuccess({ cacheTtl: 60 }), { cacheTtl: 60 }],
  ['system health', () => healthApi.getSystemHealth(), () => apiSuccess({ status: 'healthy' }), { status: 'healthy' }],
  ['database health', () => healthApi.getDatabaseHealth(), () => apiSuccess({ name: 'db' }), { name: 'db' }],
  ['Elasticsearch health', () => healthApi.getElasticsearchHealth(), () => apiSuccess({ name: 'es' }), { name: 'es' }],
  ['AI providers health', () => healthApi.getAIProvidersHealth(), () => apiSuccess({ name: 'ai' }), { name: 'ai' }],
  ['analytics', () => fetchAnalytics('/api/analytics/overview'), () => apiSuccess({ totalSearches: 4 }), { totalSearches: 4 }],
  ['an analytics conversation', () => fetchChatSession('c1'), () => apiSuccess(item), item],
  ['analytics conversations', () => fetchChatSessions(''), () => apiSuccess({ sessions: [item] }), { sessions: [item] }],
  ['the home page', () => fetchHome(), () => apiSuccess({ tips: [] }), { tips: [] }],
  ['AI providers to pick from', () => providerChoicesQuery.queryFn(), () => apiSuccess({ providers: [item] }), { providers: [item] }],
  ['the system default model', () => resolvedDefaultsQuery.queryFn(), () => apiSuccess({ chat: { providerKey: 'ollama' } }), { chat: { providerKey: 'ollama' } }],
  ['the embed snippet', () => fetchEmbedSnippet('token', undefined), () => apiSuccess({ html: '<script>' }), { html: '<script>' }],
];

describe.each(READS)('%s', (_name, call, success, expected) => {
  it('explains a gateway error page', async () => {
    answerWith(gatewayErrorPage);
    await expectGatewayError(call());
  });

  it("keeps the API's message, hint and request id", async () => {
    answerWith(() => apiErrorResponse(404));
    await expectApiError(call());
  });

  it('returns the data in the shape the page uses', async () => {
    answerWith(success);
    expect(await call()).toEqual(expected);
  });
});

describe('a tool test run', () => {
  const run = { success: false, error: 'The index was not found.', durationMs: 12 };

  it('that failed comes back as its result, to show', async () => {
    answerWith(() => apiSuccess(run, {}, 422));
    expect(await toolsApi.test('t1', { query: 'linen' })).toEqual(run);
  });

  it('that was refused says why, and a gateway error page is explained', async () => {
    answerWith(() => apiErrorResponse(400));
    await expectApiError(toolsApi.test('t1', {}), 400);
    answerWith(gatewayErrorPage);
    await expectGatewayError(toolsApi.test('t1', {}));
  });
});

describe('the analytics experience list', () => {
  it('keeps one list when the other fails, and says why the other failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.startsWith('/api/ai-experiences') ? gatewayErrorPage() : apiSuccess([{ id: 's1', name: 'Store search', slug: 'store', isActive: false }], { pagination: page })));
    const options = await loadExperienceOptions();
    expect(options.experiences).toEqual([{ id: 's1', name: 'Store search', slug: 'store', type: 'search', isActive: false }]);
    expect(options.complete).toBe(false);
    expect(options.errors).toEqual([expect.objectContaining({ name: 'ApiError', status: 502 })]);
  });

  it('is complete when both lists load', async () => {
    answerWith(() => apiSuccess([{ id: 'x1', name: 'Assistant', slug: 'assistant', isActive: true }], { pagination: page }));
    const options = await loadExperienceOptions();
    expect(options.complete).toBe(true);
    expect(options.errors).toEqual([]);
    expect(options.experiences.map((e) => e.type)).toEqual(['ai', 'search']);
  });
});

describe('a chat stream that the server refused', () => {
  it("throws the API's error before reading the stream", async () => {
    answerWith(() => apiErrorResponse(404));
    await expectApiError(aiServiceApi.chatStream({ messages: [] }).next());
    answerWith(gatewayErrorPage);
    await expectGatewayError(aiServiceApi.chatStream({ messages: [] }).next());
  });
});

describe('docs search', () => {
  it("says why a search was refused, with the API's hint", async () => {
    answerWith(() => apiErrorResponse(400));
    await expectApiError(searchDocs('linen'), 400);
  });

  it('is unavailable behind a gateway error page, as before', async () => {
    answerWith(gatewayErrorPage);
    await expect(searchDocs('linen')).rejects.toBeInstanceOf(DocsSearchUnavailableError);
  });

  it('lists the docs, and explains a gateway error page', async () => {
    answerWith(gatewayErrorPage);
    await expectGatewayError(loadDocList());
    answerWith(() => new Response(JSON.stringify({ root: [{ slug: 'intro', title: 'Intro' }], groups: [] }), { status: 200 }));
    expect(await loadDocList()).toEqual([{ slug: 'intro', title: 'Intro', group: 'Overview' }]);
  });
});
