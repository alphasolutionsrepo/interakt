// src/app/api/v1/public-routes.query-logs.test.ts
//
// A visitor's question reaches the server's log lines only when the experience's telemetry
// level is 'full', as with traces. The public search and autocomplete routes are called
// directly, with storage and the search work faked, and every log line is kept.

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';


const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getSearchExperienceBySlug: vi.fn(),
  getSearchExperienceWithIndexes: vi.fn(),
  getSearchExperienceByAccessToken: vi.fn(),
  executeExperienceSearch: vi.fn(),
  getAutocompleteSuggestions: vi.fn(),
}));

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
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
vi.mock('@/features/search-experience/autocomplete.service', () => ({ getAutocompleteSuggestions: mocks.getAutocompleteSuggestions }));

import { POST as autocomplete } from './autocomplete/route';
import { POST as searchBySlug } from './search/[slug]/search/route';
import { POST as searchByToken } from './search/route';

import { trackSearch } from '@/features/analytics/analytics-collector';
import {
  clearAllTelemetryOverrides,
  initializeTelemetryConfig,
  setExperienceTelemetryOverride,
} from '@/features/telemetry/telemetry.config';
import { rateLimiter } from '@/shared/api/rate-limit';
import type { LogLine } from '@/shared/test/log-recorder';

const QUESTION = 'can I defer my exam because of my health';
const SHOP = 'https://shop.example';

const experience = {
  id: 's1', slug: 'catalog', name: 'Catalog', isActive: true, accessToken: 'search-token',
  allowedOrigins: [SHOP], rateLimitConfig: { searchPerMinute: 50 },
  aiConfig: { enabled: false },
  indexes: [{ searchIndexId: 'i1', searchIndex: { isActive: true } }],
  searchConfig: { autocomplete: { enabled: true, minLength: 2 } },
};

function req(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://interakt.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1', 'X-Access-Token': 'search-token', Origin: SHOP },
    body: JSON.stringify(body),
  });
}

const CALLS = [
  { name: 'search by token', call: () => searchByToken(req('/api/v1/search', { query: QUESTION })) },
  { name: 'search by slug', call: () => searchBySlug(req('/api/v1/search/catalog/search', { query: QUESTION }), { params: Promise.resolve({ slug: 'catalog' }) }) },
  { name: 'autocomplete', call: () => autocomplete(req('/api/v1/autocomplete', { query: QUESTION })) },
  {
    name: 'recording the search for analytics',
    call: async () => { trackSearch({ requestId: 'r1', triggerType: 'user', searchType: 'lexical', indexIds: ['i1'], queryText: QUESTION, totalResults: 3, resultsReturned: 3, durationMs: 5, success: true }, experience.id); return new Response(null); },
  },
];

/** Every log line that carries the question, or any part of it */
const linesWithQuestion = () => logs.filter((line) => JSON.stringify(line).includes(QUESTION.slice(0, 20)));

beforeEach(() => {
  logs.length = 0;
  vi.clearAllMocks();
  rateLimiter.clear();
  initializeTelemetryConfig().enabled = true;
  mocks.auth.mockResolvedValue(null);
  mocks.getSearchExperienceBySlug.mockResolvedValue(experience);
  mocks.getSearchExperienceWithIndexes.mockResolvedValue(experience);
  mocks.getSearchExperienceByAccessToken.mockResolvedValue(experience);
  mocks.getAutocompleteSuggestions.mockResolvedValue({ suggestions: [], took: 1 });
  mocks.executeExperienceSearch.mockResolvedValue({
    results: { hits: [], total: { value: 0 }, pagination: {}, facets: [] }, sourcesSearched: [], failedSources: [],
  });
});
afterEach(() => {
  clearAllTelemetryOverrides();
  initializeTelemetryConfig().enabled = false;
});

describe.each(CALLS)('$name', ({ call }) => {
  it.each(['metadata', 'off'] as const)('logs no part of the question when the experience is set to %s, only its length', async (level) => {
    setExperienceTelemetryOverride(experience.id, level);
    await (await call()).text().catch(() => '');
    expect(logs.length).toBeGreaterThan(0);
    expect(linesWithQuestion()).toEqual([]);
    expect(logs.some((line) => typeof line.context.queryLength === 'number')).toBe(true);
  });

  it('logs no part of the question when telemetry is switched off, even if the experience says full', async () => {
    initializeTelemetryConfig().enabled = false;
    setExperienceTelemetryOverride(experience.id, 'full');
    await (await call()).text().catch(() => '');
    expect(linesWithQuestion()).toEqual([]);
  });

  it('logs the question when the experience is set to full', async () => {
    setExperienceTelemetryOverride(experience.id, 'full');
    await (await call()).text().catch(() => '');
    expect(linesWithQuestion().length).toBeGreaterThan(0);
  });
});
