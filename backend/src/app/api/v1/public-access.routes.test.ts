// src/app/api/v1/public-access.routes.test.ts
//
// Every public route that takes an experience's access token applies that
// experience's allowed origins and rate limits. The routes are called directly,
// with storage and the AI work faked; each test checks what reaches that work.

import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
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

  it.each(traffic)("$name: the token with the admin's session (the Widget playground) is a test", async (route) => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin' } });
    const own = { 'X-Access-Token': route.token, Origin: 'http://interakt.test', 'Sec-Fetch-Site': 'same-origin' };
    const seen = await sourceOf(route, own);
    expect(new Set(seen as unknown[])).toEqual(new Set(['admin_test']));
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
