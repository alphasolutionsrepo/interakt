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
import { clearAnalyticsData, loadInsightsSchedule, refreshInsights } from './analytics/_lib/insights-api';
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
import { loadDemoStatus, resetDemo, startDemoSeed } from './setup/_lib/demo-setup-api';
import { toolsApi } from './tools/_lib/api-client';

import { fetchEmbedSnippet } from '@/shared/ui/custom/fetch-embed-snippet';
import { DocsSearchUnavailableError, loadDocList, searchDocs } from '@/shared/help/docs-search';
import { helpDocError, loadHelpDoc } from '@/shared/help/load-help-doc';
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
  ['the insights schedule', () => loadInsightsSchedule(), () => apiSuccess([{ name: 'other' }, { name: 'refresh-insights', cron: '0 2 * * *' }]), { name: 'refresh-insights', cron: '0 2 * * *' }],
  ['an insights refresh', () => refreshInsights(undefined), () => new Response('data: {"step":"done"}\n\ndata: [DONE]\n\n', { status: 200 }), undefined],
  ['clearing analytics data', () => clearAnalyticsData('e1'), () => apiSuccess({ deleted: 3 }), undefined],
  ['the demo status', () => loadDemoStatus(), () => apiSuccess({ seeded: false }), { seeded: false }],
  ['a demo reset', () => resetDemo(), () => apiSuccess({ action: 'reset', deleted: ['index'] }), { action: 'reset', deleted: ['index'] }],
  ['a help article', () => loadHelpDoc('concepts/tools'), () => new Response(JSON.stringify({ title: 'Tools', content: '# Tools' }), { status: 200 }), { title: 'Tools', content: '# Tools' }],
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

describe('the embed snippet request', () => {
  it("sends the experience's access token, not the admin session, and the container asked for", async () => {
    const fetchStub = answerWith(() => apiSuccess({ html: '<script>' }));
    await fetchEmbedSnippet('tok-1', 'search-here');
    await fetchEmbedSnippet('tok-1', undefined);
    expect(fetchStub.mock.calls.map(([url]) => url)).toEqual(['/api/v1/embed-snippet?containerId=search-here', '/api/v1/embed-snippet']);
    expect(fetchStub.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: { 'X-Access-Token': 'tok-1' }, credentials: 'omit' });
  });
});

describe('the analytics experience list request', () => {
  it('asks for up to 100 of each kind of experience', async () => {
    const fetchStub = answerWith(() => apiSuccess([], { pagination: page }));
    await loadExperienceOptions();
    expect(fetchStub.mock.calls.map(([url]) => url).sort()).toEqual(['/api/ai-experiences?page=1&pageSize=100', '/api/search-experiences?pageSize=100']);
  });
});

describe('the insights schedule', () => {
  it.each([401, 403])('is hidden from a viewer who may not see schedules (%i)', async (status) => {
    answerWith(() => apiErrorResponse(status));
    expect(await loadInsightsSchedule()).toBe('forbidden');
  });

  it('is null when nothing refreshes insights', async () => {
    answerWith(() => apiSuccess([{ name: 'other' }]));
    expect(await loadInsightsSchedule()).toBeNull();
  });
});

describe('an insights refresh', () => {
  it('already running (409) is left to the status poll', async () => {
    answerWith(() => apiErrorResponse(409));
    await expect(refreshInsights('e1')).resolves.toBeUndefined();
  });

  it('asks for the experience on screen', async () => {
    const fetchStub = answerWith(() => new Response('data: [DONE]\n\n', { status: 200 }));
    await refreshInsights('e1');
    expect(JSON.parse(String(fetchStub.mock.calls[0][1]?.body))).toEqual({ triggeredBy: 'admin', experienceId: 'e1' });
  });
});

describe('clearing analytics data', () => {
  it('asks to clear everything for the experience on screen', async () => {
    const fetchStub = answerWith(() => apiSuccess({ deleted: 3 }));
    await clearAnalyticsData('e1');
    expect(fetchStub.mock.calls[0][1]).toMatchObject({ method: 'DELETE', body: JSON.stringify({ scope: 'all', experienceId: 'e1' }) });
  });
});

describe('demo setup', () => {
  it('checks Ollama at the URL given', async () => {
    const fetchStub = answerWith(() => apiSuccess({ seeded: false }));
    await loadDemoStatus('http://localhost:11434');
    expect(fetchStub.mock.calls[0][0]).toBe('/api/admin/setup-demo?ollamaBaseUrl=http%3A%2F%2Flocalhost%3A11434');
  });

  it('starts a setup and returns its progress stream, or says why it was refused', async () => {
    answerWith(() => new Response('data: [DONE]\n\n', { status: 200 }));
    expect(await startDemoSeed({ action: 'seed' })).toBeInstanceOf(ReadableStream);
    answerWith(() => apiErrorResponse(400));
    await expectApiError(startDemoSeed({ action: 'seed' }), 400);
    answerWith(gatewayErrorPage);
    await expectGatewayError(startDemoSeed({ action: 'seed' }));
  });
});

describe('a help article that could not be loaded', () => {
  it('is not available yet when missing, and says what failed otherwise', async () => {
    answerWith(() => new Response(JSON.stringify({ error: 'Documentation not found' }), { status: 404 }));
    expect(helpDocError(await loadHelpDoc('nope').catch((e: unknown) => e))).toBe("This article isn't available yet.");
    answerWith(gatewayErrorPage);
    expect(helpDocError(await loadHelpDoc('concepts/tools').catch((e: unknown) => e))).toBe('Failed to load the article (502)');
    answerWith(() => apiErrorResponse(500));
    expect(helpDocError(await loadHelpDoc('concepts/tools').catch((e: unknown) => e))).toBe('The index was not found. Pick another index.');
  });
});
