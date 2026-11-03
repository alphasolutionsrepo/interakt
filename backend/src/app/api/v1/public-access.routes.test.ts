// src/app/api/v1/public-access.routes.test.ts
//
// Every public route that takes an experience's access token applies that
// experience's allowed origins and rate limits. The routes are called directly,
// with storage and the AI work faked; each test checks what reaches that work.

import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getSearchExperienceBySlug: vi.fn(),
  getSearchExperienceWithIndexes: vi.fn(),
  getSearchExperienceByAccessToken: vi.fn(),
  getAIExperienceBySlug: vi.fn(),
  getAIExperienceByAccessToken: vi.fn(),
  executeExperienceSearch: vi.fn(),
  createSummaryStream: vi.fn(),
  runChatPipeline: vi.fn(),
  getAutocompleteSuggestions: vi.fn(),
  getDocumentByIdFromIndex: vi.fn(),
}));

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/features/auth/auth.api.handlers', () => ({ auth: mocks.auth }));
vi.mock('@/features/telemetry', () => ({
  flushTelemetry: vi.fn().mockResolvedValue(undefined),
  runWithTelemetryLevel: (_level: string, fn: () => unknown) => fn(),
}));
vi.mock('@/features/search-experience/search-experience.repository', () => ({
  getSearchExperienceBySlug: mocks.getSearchExperienceBySlug,
  getSearchExperienceWithIndexes: mocks.getSearchExperienceWithIndexes,
}));
vi.mock('@/features/search-experience/search-experience.service', () => ({
  getSearchExperienceByAccessToken: mocks.getSearchExperienceByAccessToken,
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock('@/features/search-experience/experience-search', () => ({
  executeExperienceSearch: mocks.executeExperienceSearch,
  NoSourcesError: class NoSourcesError extends Error {},
}));
vi.mock('@/features/chat/summary-stream', () => ({ createSummaryStream: mocks.createSummaryStream }));
vi.mock('@/features/ai-experience/ai-experience.service', () => ({
  getAIExperienceBySlug: mocks.getAIExperienceBySlug,
  getAIExperienceByAccessToken: mocks.getAIExperienceByAccessToken,
}));
vi.mock('@/features/pipeline/chat-pipeline', () => ({ runChatPipeline: mocks.runChatPipeline }));
vi.mock('@/features/search-experience/autocomplete.service', () => ({ getAutocompleteSuggestions: mocks.getAutocompleteSuggestions }));
vi.mock('@/features/search/search.service', () => ({ getDocumentByIdFromIndex: mocks.getDocumentByIdFromIndex }));

import { POST as chatBySlug } from './ai-experiences/[slug]/chat/route';
import { POST as chatByToken } from './ai-experiences/chat/route';
import { GET as widgetConfig } from './ai-experiences/widget-config/route';
import { POST as autocomplete } from './autocomplete/route';
import { GET as documentById } from './documents/[documentId]/route';
import { GET as embedSnippet } from './embed-snippet/route';
import { POST as searchBySlug } from './search/[slug]/search/route';
import { POST as summaryBySlug } from './search/[slug]/summarize/route';
import { POST as searchByToken } from './search/route';
import { POST as summaryByToken } from './summarize/route';

import { getAnalyticsSourceContext } from '@/features/analytics/analytics-source-context';
import * as searchService from '@/features/search-experience/search-experience.service';
import { rateLimiter } from '@/shared/api/rate-limit';
import { PUBLIC_FAILURE_MESSAGE } from '@/shared/api/response';

const SHOP = 'https://shop.example';
const OTHER = 'https://other.example';

const searchExperience = {
  id: 's1', slug: 'catalog', name: 'Catalog', isActive: true, accessToken: 'search-token',
  allowedOrigins: [SHOP], rateLimitConfig: { searchPerMinute: 2, chatPerMinute: 9 },
  aiConfig: { enabled: true, summary: { enabled: true } },
  indexes: [{ searchIndexId: 'i1', searchIndex: { isActive: true } }],
  searchConfig: { autocomplete: { enabled: true, minLength: 2 } },
};
const aiExperience = {
  id: 'a1', slug: 'assistant', name: 'Assistant', isActive: true, accessToken: 'chat-token',
  accessConfig: { allowedOrigins: [SHOP], rateLimits: { chatPerMinute: 2, requestsPerDay: 100 } },
  personaConfig: {},
};

const SUMMARY = { query: 'jeans', results: [{ id: 'x', index: { id: 'i', name: 'i' }, fields: { title: 'Jeans' } }] };

interface Route {
  name: string;
  call: (headers: Record<string, string>) => Promise<Response>;
  /** The work the route does once access is granted. */
  work: () => ReturnType<typeof vi.fn>;
  token: string;
  slugRoute: boolean;
  checksOrigin: boolean;
  /** Setup calls (widget settings, embed snippet) aren't counted towards any limit. */
  setup?: boolean;
}

function req(path: string, method: string, headers: Record<string, string>, body?: unknown): NextRequest {
  return new NextRequest(`http://interakt.test${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const slugParams = (slug: string) => ({ params: Promise.resolve({ slug }) });

const ROUTES: Route[] = [
  {
    name: 'search by token', token: 'search-token', slugRoute: false, checksOrigin: true,
    call: (h) => searchByToken(req('/api/v1/search', 'POST', h, { query: 'jeans' })),
    work: () => mocks.executeExperienceSearch,
  },
  {
    name: 'autocomplete', token: 'search-token', slugRoute: false, checksOrigin: true,
    call: (h) => autocomplete(req('/api/v1/autocomplete', 'POST', h, { query: 'je' })),
    work: () => mocks.getAutocompleteSuggestions,
  },
  {
    name: 'AI summary by token', token: 'search-token', slugRoute: false, checksOrigin: true,
    call: (h) => summaryByToken(req('/api/v1/summarize', 'POST', h, SUMMARY)),
    work: () => mocks.createSummaryStream,
  },
  {
    name: 'document by token', token: 'search-token', slugRoute: false, checksOrigin: true,
    call: (h) => documentById(req('/api/v1/documents/d1', 'GET', h), { params: Promise.resolve({ documentId: 'd1' }) }),
    work: () => mocks.getDocumentByIdFromIndex,
  },
  {
    name: 'search by slug', token: 'search-token', slugRoute: true, checksOrigin: true,
    call: (h) => searchBySlug(req('/api/v1/search/catalog/search', 'POST', h, { query: 'jeans' }), slugParams('catalog')),
    work: () => mocks.executeExperienceSearch,
  },
  {
    name: 'AI summary by slug', token: 'search-token', slugRoute: true, checksOrigin: true,
    call: (h) => summaryBySlug(req('/api/v1/search/catalog/summarize', 'POST', h, SUMMARY), slugParams('catalog')),
    work: () => mocks.createSummaryStream,
  },
  {
    name: 'chat by slug', token: 'chat-token', slugRoute: true, checksOrigin: true,
    call: (h) => chatBySlug(req('/api/v1/ai-experiences/assistant/chat', 'POST', h, { message: 'hi' }), slugParams('assistant')),
    work: () => mocks.runChatPipeline,
  },
  {
    name: 'chat by token', token: 'chat-token', slugRoute: false, checksOrigin: true,
    call: (h) => chatByToken(req('/api/v1/ai-experiences/chat', 'POST', h, { message: 'hi' })),
    work: () => mocks.runChatPipeline,
  },
  {
    name: 'widget config', token: 'chat-token', slugRoute: false, checksOrigin: true, setup: true,
    call: (h) => widgetConfig(req('/api/v1/ai-experiences/widget-config', 'GET', h)),
    work: () => mocks.getAIExperienceByAccessToken,
  },
  {
    name: 'embed snippet', token: 'chat-token', slugRoute: false, checksOrigin: false, setup: true,
    call: (h) => embedSnippet(req('/api/v1/embed-snippet', 'GET', h)),
    work: () => mocks.getAIExperienceByAccessToken,
  },
];

/** Drains a streamed body so the route's background work finishes. */
async function settle(response: Response): Promise<number> {
  await response.text().catch(() => '');
  return response.status;
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimiter.clear();
  mocks.auth.mockResolvedValue(null);
  mocks.getSearchExperienceBySlug.mockResolvedValue(searchExperience);
  mocks.getSearchExperienceWithIndexes.mockResolvedValue(searchExperience);
  mocks.getSearchExperienceByAccessToken.mockImplementation(async (token: string) => {
    if (token === 'search-token') return searchExperience;
    throw new searchService.UnauthorizedError('not a search token');
  });
  mocks.getAutocompleteSuggestions.mockResolvedValue({ suggestions: [] });
  mocks.getDocumentByIdFromIndex.mockResolvedValue({ id: 'd1', fields: {} });
  mocks.getAIExperienceBySlug.mockResolvedValue(aiExperience);
  mocks.getAIExperienceByAccessToken.mockImplementation(async (token: string) => (token === 'chat-token' ? aiExperience : null));
  mocks.executeExperienceSearch.mockResolvedValue({
    results: { hits: [], total: { value: 0 }, pagination: {}, facets: [] }, sourcesSearched: [], failedSources: [],
  });
  mocks.createSummaryStream.mockReturnValue(new ReadableStream({ start: (c) => c.close() }));
  mocks.runChatPipeline.mockResolvedValue({ sessionId: 's', responseText: 'ok', usage: {} });
});

describe.each(ROUTES)('$name', (route) => {
  const token = { 'X-Access-Token': route.token };

  it(route.checksOrigin ? 'refuses a site that is not allowed, before doing any work' : 'serves any site (it is a setup route)', async () => {
    const work = route.work();
    work.mockClear();
    const status = await settle(await route.call({ ...token, Origin: OTHER }));
    if (route.checksOrigin) {
      expect(status).toBe(403);
      if (work !== mocks.getAIExperienceByAccessToken) expect(work).not.toHaveBeenCalled();
    } else {
      expect(status).toBe(200);
    }
  });

  it.runIf(route.setup)('serves the allowed site, however often (a setup call)', async () => {
    for (let i = 0; i < 5; i++) expect(await settle(await route.call({ ...token, Origin: SHOP }))).toBe(200);
  });

  it.skipIf(route.setup)('serves the allowed site, then answers 429 past the per-minute limit', async () => {
    const work = route.work();
    expect(await settle(await route.call({ ...token, Origin: SHOP }))).not.toBe(403);
    expect(work).toHaveBeenCalled();
    expect(await settle(await route.call({ ...token, Origin: SHOP }))).not.toBe(429);

    const refused = await route.call({ ...token, Origin: SHOP });
    expect(refused.status).toBe(429);
    expect(refused.headers.get('Retry-After')).toBeTruthy();
  });

  it.runIf(route.slugRoute)("doesn't apply the settings to a signed-in admin (the playground)", async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin' } });
    for (let i = 0; i < 3; i++) {
      expect(await settle(await route.call({ Origin: OTHER }))).not.toBe(403);
    }
    expect(route.work()).toHaveBeenCalledTimes(3);
  });
});

describe("the admin's widget preview", () => {
  it("works on Interakt's own address even when the experience allows only its shop", async () => {
    const own = { 'X-Access-Token': 'chat-token', Origin: 'http://interakt.test', 'Sec-Fetch-Site': 'same-origin' };
    expect(await settle(await widgetConfig(req('/api/v1/ai-experiences/widget-config', 'GET', own)))).toBe(200);
    expect(await settle(await chatByToken(req('/api/v1/ai-experiences/chat', 'POST', own, { message: 'hi' })))).toBe(200);
  });

  it("works on the search routes too, which the search playground's autocomplete and documents use", async () => {
    const own = { 'X-Access-Token': 'search-token', Origin: 'http://interakt.test', 'Sec-Fetch-Site': 'same-origin' };
    expect(await settle(await searchByToken(req('/api/v1/search', 'POST', own, { query: 'jeans' })))).toBe(200);
    expect(await settle(await autocomplete(req('/api/v1/autocomplete', 'POST', own, { query: 'je' })))).toBe(200);
    const other = { ...own, 'Sec-Fetch-Site': 'cross-site' };
    expect(await settle(await autocomplete(req('/api/v1/autocomplete', 'POST', other, { query: 'je' })))).toBe(403);
  });

  it('refuses another site that sends forwarded headers naming itself', async () => {
    const forged = { 'X-Access-Token': 'chat-token', Origin: OTHER, 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'other.example' };
    expect(await settle(await widgetConfig(req('/api/v1/ai-experiences/widget-config', 'GET', forged)))).toBe(403);
    expect(await settle(await chatByToken(req('/api/v1/ai-experiences/chat', 'POST', forged, { message: 'hi' })))).toBe(403);
    expect(mocks.runChatPipeline).not.toHaveBeenCalled();
  });
});

describe('where the traffic is recorded as coming from', () => {
  /** The source each route's work runs under: the chat's input, or the context its search or summary records with. */
  async function sourceOf(route: Route, headers: Record<string, string>): Promise<unknown> {
    let seen: unknown;
    mocks.executeExperienceSearch.mockImplementation(async (_e: unknown, _r: unknown, options: { source?: string }) => {
      seen = [getAnalyticsSourceContext(), options.source];
      return { results: { hits: [], total: { value: 0 }, pagination: {}, facets: [] }, sourcesSearched: [], failedSources: [] };
    });
    // The summary's model call runs in the stream's start, as in summary-stream.ts
    mocks.createSummaryStream.mockImplementation(() => new ReadableStream({
      start: async (c) => { await Promise.resolve(); seen = [getAnalyticsSourceContext()]; c.close(); },
    }));
    mocks.runChatPipeline.mockImplementation(async (input: { analyticsSource?: string }) => {
      seen = [input.analyticsSource];
      return { sessionId: 's', responseText: 'ok', usage: {} };
    });
    expect(await settle(await route.call(headers))).toBe(200);
    return seen;
  }

  const traffic = ROUTES.filter((r) => ['search by token', 'AI summary by token', 'chat by token', 'search by slug', 'AI summary by slug', 'chat by slug'].includes(r.name));

  it.each(traffic)('$name: a visitor with the token is live traffic', async (route) => {
    const seen = await sourceOf(route, { 'X-Access-Token': route.token, Origin: SHOP });
    expect(new Set(seen as unknown[])).toEqual(new Set(['api']));
  });

  const own = (route: Route, marker: boolean) => ({
    'X-Access-Token': route.token, Origin: 'http://interakt.test', 'Sec-Fetch-Site': 'same-origin',
    ...(marker && { 'X-Interakt-Test': '1' }),
  });

  it.each(traffic)("$name: the token with the test marker and the admin's login (the Widget playground) is a test", async (route) => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin' } });
    const seen = await sourceOf(route, own(route, true));
    expect(new Set(seen as unknown[])).toEqual(new Set(['admin_test']));
  });

  it.each(traffic.filter((r) => !r.slugRoute))("$name: the login without the marker (an admin on a live widget) is live", async (route) => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin' } });
    const seen = await sourceOf(route, own(route, false));
    expect(new Set(seen as unknown[])).toEqual(new Set(['api']));
  });

  it.each(traffic.filter((r) => !r.slugRoute))('$name: the marker without a login (a visitor) is live', async (route) => {
    const seen = await sourceOf(route, { 'X-Access-Token': route.token, Origin: SHOP, 'X-Interakt-Test': '1' });
    expect(new Set(seen as unknown[])).toEqual(new Set(['api']));
  });

  it.each(traffic.filter((r) => r.slugRoute))('$name: an admin without the token (the playground) is a test', async (route) => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin' } });
    const seen = await sourceOf(route, {});
    expect(new Set(seen as unknown[])).toEqual(new Set(['admin_test']));
  });
});

describe('allowed sites saved with a trailing slash', () => {
  it('still let that site in', async () => {
    const saved = { allowedOrigins: [`${SHOP}/`], rateLimits: { chatPerMinute: 100, requestsPerDay: 100 } };
    mocks.getAIExperienceByAccessToken.mockResolvedValue({ ...aiExperience, accessConfig: saved });
    mocks.getSearchExperienceBySlug.mockResolvedValue({ ...searchExperience, allowedOrigins: [`${SHOP}/`] });
    const from = (token: string, origin: string) => ({ 'X-Access-Token': token, Origin: origin });
    expect(await settle(await widgetConfig(req('/api/v1/ai-experiences/widget-config', 'GET', from('chat-token', SHOP))))).toBe(200);
    expect(await settle(await chatByToken(req('/api/v1/ai-experiences/chat', 'POST', from('chat-token', SHOP), { message: 'hi' })))).toBe(200);
    expect(await settle(await widgetConfig(req('/api/v1/ai-experiences/widget-config', 'GET', from('chat-token', OTHER))))).toBe(403);
    expect(await settle(await summaryBySlug(req('/api/v1/search/catalog/summarize', 'POST', from('search-token', SHOP), SUMMARY), slugParams('catalog')))).toBe(200);
  });
});

describe('widget setup calls', () => {
  it("aren't counted, so page loads never use up a visitor's chat messages", async () => {
    mocks.getAIExperienceByAccessToken.mockResolvedValue({
      ...aiExperience,
      accessConfig: { allowedOrigins: [], rateLimits: { chatPerMinute: 2, requestsPerDay: 100 } },
    });
    const visitor = { 'X-Access-Token': 'chat-token', 'X-Forwarded-For': '1.1.1.1' };
    for (let i = 0; i < 10; i++) {
      expect(await settle(await widgetConfig(req('/api/v1/ai-experiences/widget-config', 'GET', visitor)))).toBe(200);
      expect(await settle(await embedSnippet(req('/api/v1/embed-snippet', 'GET', visitor)))).toBe(200);
    }
    expect(await settle(await chatByToken(req('/api/v1/ai-experiences/chat', 'POST', visitor, { message: 'hi' })))).toBe(200);
    expect(await settle(await chatByToken(req('/api/v1/ai-experiences/chat', 'POST', visitor, { message: 'hi' })))).toBe(200);
    expect(await settle(await chatByToken(req('/api/v1/ai-experiences/chat', 'POST', visitor, { message: 'hi' })))).toBe(429);
  });
});

describe('embed snippet', () => {
  const snippet = async (headers: Record<string, string>, query = '') =>
    (await (await embedSnippet(req(`/api/v1/embed-snippet${query}`, 'GET', headers))).json()).data;

  it("builds the chat widget's snippet with the token and this Interakt's script address", async () => {
    const data = await snippet({ 'X-Access-Token': 'chat-token' });
    expect(data).toMatchObject({
      widget: 'chat', experienceName: 'Assistant', containerId: 'interakt-chat',
      globalName: 'ChatDropinUI', scriptUrl: 'http://interakt.test/embed/v1/widgets.js',
    });
    expect(data.html).toContain('chat-token');
    expect(data.html).toContain('http://interakt.test/embed/v1/widgets.js');
  });

  it("builds the search widget's snippet, at the address the proxy reports, in the container asked for", async () => {
    const proxied = { 'X-Access-Token': 'search-token', 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'search.example' };
    const data = await snippet(proxied, '?containerId=my-box');
    expect(data).toMatchObject({
      widget: 'search', experienceName: 'Catalog', containerId: 'my-box',
      globalName: 'SearchDropinUI', scriptUrl: 'https://search.example/embed/v1/widgets.js',
    });
    expect(data.html).toContain('search-token');
  });
});

describe('chat daily total', () => {
  it('counts a message when it arrives, even if answering it then fails', async () => {
    mocks.getAIExperienceByAccessToken.mockResolvedValue({
      ...aiExperience,
      accessConfig: { allowedOrigins: [], rateLimits: { chatPerMinute: 100, requestsPerDay: 2 } },
    });
    mocks.runChatPipeline.mockRejectedValueOnce(new Error('model unavailable'));
    const from = (ip: string) => ({ 'X-Access-Token': 'chat-token', 'X-Forwarded-For': ip });
    const chat = (ip: string) => chatByToken(req('/api/v1/ai-experiences/chat', 'POST', from(ip), { message: 'hi' }));
    await settle(await chat('1.1.1.1'));
    expect(mocks.runChatPipeline).toHaveBeenCalledTimes(1);
    expect(await settle(await chat('2.2.2.2'))).toBe(200);
    expect(await settle(await chat('3.3.3.3'))).toBe(429);
  });

  it("doesn't count requests refused for a malformed body", async () => {
    const limited = { ...aiExperience, accessConfig: { allowedOrigins: [], rateLimits: { chatPerMinute: 100, requestsPerDay: 2 } } };
    mocks.getAIExperienceBySlug.mockResolvedValue(limited);
    mocks.getAIExperienceByAccessToken.mockResolvedValue(limited);
    const from = (ip: string) => ({ 'X-Access-Token': 'chat-token', 'X-Forwarded-For': ip });
    const byToken = (ip: string, body: unknown) => chatByToken(req('/api/v1/ai-experiences/chat', 'POST', from(ip), body));
    const bySlug = (ip: string, body: unknown) =>
      chatBySlug(req('/api/v1/ai-experiences/assistant/chat', 'POST', from(ip), body), slugParams('assistant'));
    expect(await settle(await byToken('1.1.1.1', {}))).toBe(400);
    expect(await settle(await bySlug('2.2.2.2', {}))).toBe(400);
    expect(await settle(await byToken('3.3.3.3', { message: '' }))).toBe(400);
    expect(await settle(await byToken('4.4.4.4', { message: 'hi' }))).toBe(200);
    expect(await settle(await bySlug('5.5.5.5', { message: 'hi' }))).toBe(200);
  });


  it("doesn't count widget page loads or the embed snippet, only chat messages", async () => {
    mocks.getAIExperienceByAccessToken.mockResolvedValue({
      ...aiExperience,
      accessConfig: { allowedOrigins: [], rateLimits: { chatPerMinute: 100, requestsPerDay: 2 } },
    });
    const from = (ip: string) => ({ 'X-Access-Token': 'chat-token', 'X-Forwarded-For': ip });
    for (const ip of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) {
      expect(await settle(await widgetConfig(req('/api/v1/ai-experiences/widget-config', 'GET', from(ip))))).toBe(200);
      expect(await settle(await embedSnippet(req('/api/v1/embed-snippet', 'GET', from(ip))))).toBe(200);
    }
    expect(await settle(await chatByToken(req('/api/v1/ai-experiences/chat', 'POST', from('4.4.4.4'), { message: 'hi' })))).toBe(200);
    expect(await settle(await chatByToken(req('/api/v1/ai-experiences/chat', 'POST', from('5.5.5.5'), { message: 'hi' })))).toBe(200);
    expect(await settle(await chatByToken(req('/api/v1/ai-experiences/chat', 'POST', from('6.6.6.6'), { message: 'hi' })))).toBe(429);
  });

  it('counts chat by slug and chat by token against the same daily total', async () => {
    const limited = { ...aiExperience, accessConfig: { allowedOrigins: [], rateLimits: { chatPerMinute: 100, requestsPerDay: 2 } } };
    mocks.getAIExperienceBySlug.mockResolvedValue(limited);
    mocks.getAIExperienceByAccessToken.mockResolvedValue(limited);
    const from = (ip: string) => ({ 'X-Access-Token': 'chat-token', 'X-Forwarded-For': ip });
    const slug = (ip: string) => chatBySlug(req('/api/v1/ai-experiences/assistant/chat', 'POST', from(ip), { message: 'hi' }), slugParams('assistant'));
    expect(await settle(await slug('1.1.1.1'))).toBe(200);
    expect(await settle(await chatByToken(req('/api/v1/ai-experiences/chat', 'POST', from('2.2.2.2'), { message: 'hi' })))).toBe(200);
    expect(await settle(await slug('3.3.3.3'))).toBe(429);
  });

  it('answers 429 once the experience has used its requests for the day, whoever asks', async () => {
    mocks.getAIExperienceByAccessToken.mockResolvedValue({
      ...aiExperience,
      accessConfig: { allowedOrigins: [], rateLimits: { chatPerMinute: 100, requestsPerDay: 2 } },
    });
    const from = (ip: string) => ({ 'X-Access-Token': 'chat-token', 'X-Forwarded-For': ip });
    expect(await settle(await chatByToken(req('/api/v1/ai-experiences/chat', 'POST', from('1.1.1.1'), { message: 'hi' })))).toBe(200);
    expect(await settle(await chatByToken(req('/api/v1/ai-experiences/chat', 'POST', from('2.2.2.2'), { message: 'hi' })))).toBe(200);
    expect(await settle(await chatByToken(req('/api/v1/ai-experiences/chat', 'POST', from('3.3.3.3'), { message: 'hi' })))).toBe(429);
  });
});

// What the engine throws when Elasticsearch can't be reached (see search.service)
const down = async () => {
  const { errors } = await import('@elastic/elasticsearch');
  const { SearchError } = await import('@/features/search/search.types');
  const cause = new errors.ConnectionError('connect ECONNREFUSED 10.0.0.7:9200', { body: null, statusCode: 0, headers: {}, meta: {}, warnings: null } as never);
  return new SearchError(cause.message, 'PROVIDER_ERROR', {}, { cause });
};

describe('when the search service is down', () => {
  const failing: Array<{ name: string; route: string; work: () => ReturnType<typeof vi.fn> }> = [
    { name: 'search by token', route: 'search by token', work: () => mocks.executeExperienceSearch },
    { name: 'search by slug', route: 'search by slug', work: () => mocks.executeExperienceSearch },
    { name: 'autocomplete', route: 'autocomplete', work: () => mocks.getAutocompleteSuggestions },
  ];

  it.each(failing)('$name tells the visitor plainly, with a request id, and names no service', async ({ route, work }) => {
    work().mockRejectedValue(await down());
    const res = await ROUTES.find((r) => r.name === route)!.call({ 'X-Access-Token': 'search-token', Origin: SHOP });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({ success: false, code: 'UPSTREAM_UNAVAILABLE', message: PUBLIC_FAILURE_MESSAGE, error: PUBLIC_FAILURE_MESSAGE });
    expect(body.requestId).toMatch(/^[0-9a-f]{32}$/);
    expect(body.hint).toBeUndefined();
    expect(body.details).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/elasticsearch|ECONNREFUSED|10\.0\.0\.7/i);
  });

  it('keeps the CORS headers on the error, so the widget can read it', async () => {
    mocks.executeExperienceSearch.mockRejectedValue(await down());
    const res = await ROUTES.find((r) => r.name === 'search by token')!.call({ 'X-Access-Token': 'search-token', Origin: SHOP });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SHOP);
  });
});

describe('a failed search', () => {
  const refused = async () => {
    const { SearchError } = await import('@/features/search/search.types');
    const engine = new Error('failed to create query: For input string: "abc"');
    return new SearchError('"abc" isn\'t a valid value for rating', 'INVALID_FILTER', { fields: ['rating'] }, { cause: engine });
  };
  const searches = ['search by token', 'search by slug'];

  beforeEach(() => { logs.length = 0; });

  it.each([
    { route: 'search by token', experience: { experienceId: searchExperience.id } },
    { route: 'search by slug', experience: { slug: searchExperience.slug } },
  ])('$route logs an experience with no source once, naming it', async ({ route, experience }) => {
    const { NoSourcesError } = await import('@/features/search-experience/experience-search');
    mocks.executeExperienceSearch.mockRejectedValue(new NoSourcesError());
    const res = await ROUTES.find((r) => r.name === route)!.call({ 'X-Access-Token': 'search-token', Origin: SHOP });
    expect(res.status).toBe(400);
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'warn', context: expect.objectContaining({ code: 'NO_INDEXES', ...experience }) }),
    ]);
  });

  it.each(searches)('%s logs a refused filter once, as a warning with the request id and the engine words', async (route) => {
    mocks.executeExperienceSearch.mockRejectedValue(await refused());
    const res = await ROUTES.find((r) => r.name === route)!.call({ 'X-Access-Token': 'search-token', Origin: SHOP });
    const { requestId } = await res.json();

    expect(res.status).toBe(400);
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ requestId, code: 'INVALID_FILTER' }) })]);
    expect((reported(logs)[0].context.err as Error).cause).toMatchObject({ message: expect.stringContaining('For input string') });
  });

  it.each([
    { route: 'search by token', work: () => mocks.executeExperienceSearch, experience: { experienceId: searchExperience.id } },
    { route: 'search by slug', work: () => mocks.executeExperienceSearch, experience: { slug: searchExperience.slug } },
    { route: 'autocomplete', work: () => mocks.getAutocompleteSuggestions, experience: { experienceId: searchExperience.id } },
    { route: 'document by token', work: () => mocks.getDocumentByIdFromIndex, experience: { experienceId: searchExperience.id } },
  ])('$route logs an outage once, as an error with the request id and the experience', async ({ route, work, experience }) => {
    work().mockRejectedValue(await down());
    const res = await ROUTES.find((r) => r.name === route)!.call({ 'X-Access-Token': 'search-token', Origin: SHOP });
    const { requestId } = await res.json();

    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId, ...experience }) }),
    ]);
  });
});

describe('a request with a value of the wrong type', () => {
  it('lists the field in details, as the public API documents, and in fields', async () => {
    const res = await searchBySlug(
      req('/api/v1/search/catalog/search', 'POST', { 'X-Access-Token': 'search-token', Origin: SHOP }, { query: 'jeans', page: 'x' }),
      slugParams('catalog')
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual([expect.objectContaining({ field: 'page' })]);
    expect(body.fields).toEqual(body.details);
    expect(body.requestId).toEqual(expect.any(String));
  });
});

describe('a document lookup when the search service is down', () => {
  it('tells the visitor plainly instead of "not found"', async () => {
    // What getDocumentByIdFromIndex throws (search.service): a search error around the
    // provider's message, which the provider's lookup passes on without its own error
    const { SearchError } = await import('@/features/search/search.types');
    const lookupFailed = new Error('connect ECONNREFUSED 10.0.0.7:9200');
    mocks.getDocumentByIdFromIndex.mockRejectedValue(new SearchError(lookupFailed.message, 'PROVIDER_ERROR', {}, { cause: lookupFailed }));
    const res = await ROUTES.find((r) => r.name === 'document by token')!.call({ 'X-Access-Token': 'search-token', Origin: SHOP });
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body).toMatchObject({ code: 'PROVIDER_ERROR', message: PUBLIC_FAILURE_MESSAGE });
    expect(JSON.stringify(body)).not.toContain('10.0.0.7');
  });
});

describe("an admin testing in the playground (signed in, on the slug route)", () => {
  it('gets the failure explained in full, unlike a visitor', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin' } });
    mocks.executeExperienceSearch.mockRejectedValue(await down());
    const res = await searchBySlug(req('/api/v1/search/catalog/search', 'POST', {}, { query: 'jeans' }), slugParams('catalog'));
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', message: "Elasticsearch couldn't be reached." });
    expect(body.hint).toMatch(/running/);
  });

  it('is told an external source is unavailable; a visitor gets the plain message', async () => {
    const { SearchError } = await import('@/features/search/search.types');
    // What searchExternalSourceForExperience throws when the engine call fails
    const unavailable = () => new SearchError('An external search source is unavailable', 'SOURCE_UNAVAILABLE');

    mocks.auth.mockResolvedValue({ user: { id: 'admin' } });
    mocks.executeExperienceSearch.mockRejectedValue(unavailable());
    const admin = await searchBySlug(req('/api/v1/search/catalog/search', 'POST', {}, { query: 'jeans' }), slugParams('catalog'));
    expect(admin.status).toBe(503);
    expect(await admin.json()).toMatchObject({ code: 'SOURCE_UNAVAILABLE', message: 'An external search source is unavailable' });

    mocks.auth.mockResolvedValue(null);
    mocks.executeExperienceSearch.mockRejectedValue(unavailable());
    const visitor = await ROUTES.find((r) => r.name === 'search by token')!.call({ 'X-Access-Token': 'search-token', Origin: SHOP });
    expect(visitor.status).toBe(503);
    expect(await visitor.json()).toMatchObject({ code: 'SOURCE_UNAVAILABLE', message: PUBLIC_FAILURE_MESSAGE });
  });

  it("is told why an external source failed; a visitor isn't", async () => {
    const { SearchError } = await import('@/features/search/search.types');
    const { ExternalSearchError } = await import('@/features/data-source/external-search/external-search.types');
    const rejected = () => new SearchError('An external search source is unavailable', 'SOURCE_UNAVAILABLE', {}, {
      cause: new ExternalSearchError('Sitecore Search', 'Sitecore Search rejected the request — check the API key', 401),
    });

    mocks.auth.mockResolvedValue({ user: { id: 'admin' } });
    mocks.executeExperienceSearch.mockRejectedValue(rejected());
    const admin = await searchBySlug(req('/api/v1/search/catalog/search', 'POST', {}, { query: 'jeans' }), slugParams('catalog'));
    const adminBody = await admin.json();
    expect(adminBody).toMatchObject({ code: 'UPSTREAM_AUTH', message: 'Sitecore Search rejected the credentials.' });
    expect(adminBody.hint).toMatch(/data source's connection settings/);

    mocks.auth.mockResolvedValue(null);
    mocks.executeExperienceSearch.mockRejectedValue(rejected());
    const visitor = await ROUTES.find((r) => r.name === 'search by token')!.call({ 'X-Access-Token': 'search-token', Origin: SHOP });
    const visitorBody = await visitor.json();
    expect(visitorBody.message).toBe(PUBLIC_FAILURE_MESSAGE);
    expect(visitorBody.hint).toBeUndefined();
    expect(visitorBody.details).toBeUndefined();
    expect(JSON.stringify(visitorBody)).not.toMatch(/sitecore/i);
  });
});

describe('a document lookup where one index failed and another lacked the document', () => {
  it('answers with the failure, since the document may be in the index that failed, with CORS', async () => {
    mocks.getSearchExperienceByAccessToken.mockResolvedValue({
      ...searchExperience,
      indexes: [{ searchIndexId: 'i1', searchIndex: { isActive: true } }, { searchIndexId: 'i2', searchIndex: { isActive: true } }],
    });
    mocks.getDocumentByIdFromIndex.mockResolvedValueOnce(null).mockRejectedValueOnce(await down());
    const res = await ROUTES.find((r) => r.name === 'document by token')!.call({ 'X-Access-Token': 'search-token', Origin: SHOP });
    expect(res.status).toBe(503);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SHOP);
    expect((await res.json()).requestId).toEqual(expect.any(String));
  });
});

describe('a document lookup across indexes, for the log', () => {
  const twoIndexes = () => mocks.getSearchExperienceByAccessToken.mockResolvedValue({
    ...searchExperience,
    indexes: [{ searchIndexId: 'i1', searchIndex: { isActive: true } }, { searchIndexId: 'i2', searchIndex: { isActive: true } }],
  });
  const lookUp = () => ROUTES.find((r) => r.name === 'document by token')!.call({ 'X-Access-Token': 'search-token', Origin: SHOP });

  beforeEach(() => { logs.length = 0; });

  it('warns about an index that failed when another one had the document', async () => {
    twoIndexes();
    const failed = await down();
    mocks.getDocumentByIdFromIndex.mockRejectedValueOnce(failed).mockResolvedValueOnce({ id: 'd1', fields: {}, indexId: 'i2', indexName: 'two' });
    expect((await lookUp()).status).toBe(200);
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'warn', context: expect.objectContaining({ indexId: 'i1', experienceId: searchExperience.id, documentId: 'd1', err: failed }) }),
    ]);
  });

  it('names the index that failed on the line for the answer', async () => {
    mocks.getDocumentByIdFromIndex.mockRejectedValueOnce(await down());
    expect((await lookUp()).status).toBe(503);
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ experienceId: searchExperience.id, documentId: 'd1', indexId: 'i1' }) }),
    ]);
  });

  it('names the experience and document when it has no active index', async () => {
    mocks.getSearchExperienceByAccessToken.mockResolvedValue({ ...searchExperience, indexes: [{ searchIndexId: 'i1', searchIndex: { isActive: false } }] });
    expect((await lookUp()).status).toBe(400);
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'warn', context: expect.objectContaining({ code: 'NO_INDEXES', experienceId: searchExperience.id, documentId: 'd1' }) }),
    ]);
  });

  it('answers with the first failure and warns about the others', async () => {
    twoIndexes();
    const second = await down();
    mocks.getDocumentByIdFromIndex.mockRejectedValueOnce(await down()).mockRejectedValueOnce(second);
    expect((await lookUp()).status).toBe(503);
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'warn', context: expect.objectContaining({ indexId: 'i2', err: second }) }),
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ experienceId: searchExperience.id }) }),
    ]);
  });
});

describe('the AI summary for visitors (by token)', () => {
  it('tells the visitor plainly when the AI provider fails, with a request id and CORS', async () => {
    const providerError = Object.assign(new Error('401 Incorrect API key provided: sk-proj-abcdefghijklmnopqrstuvwxyz123456'), { name: 'AdapterError', providerKey: 'openai', statusCode: 401 });
    mocks.createSummaryStream.mockImplementation(() => { throw providerError; });
    const res = await ROUTES.find((r) => r.name === 'AI summary by token')!.call({ 'X-Access-Token': 'search-token', Origin: SHOP });
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body).toMatchObject({ code: 'UPSTREAM_AUTH', message: PUBLIC_FAILURE_MESSAGE });
    expect(body.requestId).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toMatch(/sk-proj|OpenAI/);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SHOP);
  });
});

describe('the AI summary routes with a value of the wrong type', () => {
  it.each([
    ['by token', () => summaryByToken(req('/api/v1/summarize', 'POST', { 'X-Access-Token': 'search-token', Origin: SHOP }, { query: 'jeans', results: 'x' }))],
    ['by slug', () => summaryBySlug(req('/api/v1/search/catalog/summarize', 'POST', { 'X-Access-Token': 'search-token', Origin: SHOP }, { query: 'jeans', results: 'x' }), slugParams('catalog'))],
  ])('%s list the field in details', async (_name, call) => {
    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body).toMatchObject({ code: 'VALIDATION_ERROR', requestId: expect.any(String) });
    expect(body.details).toEqual([expect.objectContaining({ field: 'results' })]);
  });
});

describe('the AI summary by slug when the AI provider fails', () => {
  const providerError = () => Object.assign(new Error('401 Incorrect API key provided'), { name: 'AdapterError', providerKey: 'openai', statusCode: 401 });

  it('tells the visitor plainly', async () => {
    mocks.createSummaryStream.mockImplementation(() => { throw providerError(); });
    const res = await summaryBySlug(req('/api/v1/search/catalog/summarize', 'POST', { 'X-Access-Token': 'search-token', Origin: SHOP }, SUMMARY), slugParams('catalog'));
    expect(await res.json()).toMatchObject({ code: 'UPSTREAM_AUTH', message: PUBLIC_FAILURE_MESSAGE });
  });

  it('explains it in full to an admin in the playground', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin' } });
    mocks.createSummaryStream.mockImplementation(() => { throw providerError(); });
    const res = await summaryBySlug(req('/api/v1/search/catalog/summarize', 'POST', {}, SUMMARY), slugParams('catalog'));
    expect(await res.json()).toMatchObject({ code: 'UPSTREAM_AUTH', message: 'OpenAI rejected the credentials.' });
  });
});

describe('input errors on the token search and autocomplete', () => {
  it.each([
    ['search by token', () => searchByToken(req('/api/v1/search', 'POST', { 'X-Access-Token': 'search-token', Origin: SHOP }, { query: 'jeans', page: 'x' }))],
    ['autocomplete', () => autocomplete(req('/api/v1/autocomplete', 'POST', { 'X-Access-Token': 'search-token', Origin: SHOP }, { query: 42 }))],
  ])('%s list the field in details, with CORS', async (_name, call) => {
    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual(body.fields);
    expect(body.details.length).toBeGreaterThan(0);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SHOP);
  });
});

describe('a search experience that does not exist', () => {
  it('answers in the shared shape, with a request id', async () => {
    mocks.getSearchExperienceBySlug.mockResolvedValue(null);
    const res = await searchBySlug(req('/api/v1/search/nope/search', 'POST', { 'X-Access-Token': 'search-token', Origin: SHOP }, { query: 'jeans' }), slugParams('nope'));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND', message: 'Search experience not found', requestId: expect.any(String) });
  });
});

describe('a document that is not in any index', () => {
  it('is still not found when the lookups worked', async () => {
    mocks.getDocumentByIdFromIndex.mockResolvedValue(null);
    const res = await ROUTES.find((r) => r.name === 'document by token')!.call({ 'X-Access-Token': 'search-token', Origin: SHOP });
    expect(res.status).toBe(404);
  });
});
