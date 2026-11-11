// src/app/experiences/_hooks/useUnifiedExperiences.counts.test.ts

/**
 * The four cards at the top of the experiences hub. Real routes over a real database (PGlite),
 * asked with the queries the hub builds for each tab: the cards come from the server's counts of
 * the whole set, so they are the same on every tab and a filter applies to both kinds.
 */

import { sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { hubMetrics, listParamsFor, type UseUnifiedExperiencesParams } from './useUnifiedExperiences';

import * as aiList from '@/app/api/ai-experiences/route';
import * as searchList from '@/app/api/search-experiences/route';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);

const U = '00000000-0000-4000-8000-0000000000aa';

// 30 chat experiences (27 active; 3 of them named "help", 2 active) and 5 search experiences
// (4 active; 2 of them named "help", 1 active). More chat than any page the hub asks for.
beforeAll(async () => {
  testDb = await createAppTestDb();
  const chat = (name: string, active: boolean) => testDb.db.execute(sql`INSERT INTO ai_experiences (name, slug, created_by, persona_config, session_config, access_config, observability_config, is_active) VALUES (${name}, ${name}, ${U}, '{}', '{}', '{}', '{}', ${active})`);
  const search = (name: string, active: boolean) => testDb.db.execute(sql`INSERT INTO search_experiences (name, slug, search_config, ai_config, tools_config, created_by, is_active) VALUES (${name}, ${name}, '{}', '{}', '{}', ${U}, ${active})`);
  for (let i = 0; i < 27; i++) await chat(`chat-${i}`, i < 25);
  await chat('help-chat-1', true);
  await chat('help-chat-2', true);
  await chat('help-chat-3', false);
  for (let i = 0; i < 3; i++) await search(`find-${i}`, true);
  await search('help-search-1', true);
  await search('help-search-2', false);
}, 60_000);
afterAll(() => testDb.close());

type Tab = UseUnifiedExperiencesParams['typeFilter'];
type Counts = { total: number; active: number };

/** What the hub does for one tab: ask each kind's route with that kind's query, then add up the cards */
async function cardsOn(tab: Tab, filters: { search?: string; isActive?: boolean } = {}, page = 1) {
  const params = { typeFilter: tab, page, pageSize: 12, ...filters };
  const ask = async (route: { GET: unknown }, kind: 'ai' | 'search') => {
    const q = listParamsFor(kind, params);
    const url = new URLSearchParams();
    if (q?.page) url.set('page', String(q.page));
    if (q?.pageSize) url.set('pageSize', String(q.pageSize));
    if (q?.search) url.set('search', q.search);
    if (q?.isActive !== undefined) url.set('isActive', String(q.isActive));
    const res = await (route.GET as (r: NextRequest) => Promise<Response>)(new NextRequest(`http://localhost/api/x?${url}`));
    return (await res.json()).pagination.counts as Counts;
  };
  return hubMetrics(await ask(aiList, 'ai'), await ask(searchList, 'search'));
}

describe('the experiences hub cards', () => {
  const ALL_THE_DATA = { total: 35, active: 31, aiCount: 30, searchCount: 5 };

  it('show the same numbers on every tab and page for the same data', async () => {
    for (const tab of ['all', 'ai', 'search'] as const) {
      expect(await cardsOn(tab)).toEqual(ALL_THE_DATA);
    }
    expect(await cardsOn('ai', {}, 3)).toEqual(ALL_THE_DATA);
  });

  it('count Active over everything, not the experiences on the loaded page', async () => {
    // 27 chat experiences are active, more than the 12 a tab loads, and more than 25, the server's default page
    expect((await cardsOn('search')).active).toBe(31);
    expect((await cardsOn('ai')).active).toBe(31);
  });

  it('apply a search to both kinds, on every tab', async () => {
    for (const tab of ['all', 'ai', 'search'] as const) {
      expect(await cardsOn(tab, { search: 'help' })).toEqual({ total: 5, active: 3, aiCount: 3, searchCount: 2 });
    }
  });

  it('apply a status filter to both kinds, on every tab', async () => {
    for (const tab of ['all', 'ai', 'search'] as const) {
      expect(await cardsOn(tab, { isActive: true })).toEqual({ total: 31, active: 31, aiCount: 27, searchCount: 4 });
      // Inactive experiences: the search list must read "false" as false, not as true
      expect(await cardsOn(tab, { isActive: false })).toEqual({ total: 4, active: 0, aiCount: 3, searchCount: 1 });
    }
  });
});

describe('hubMetrics', () => {
  it('adds the kinds the user can see and counts a kind that was not loaded as zero', () => {
    expect(hubMetrics({ total: 3, active: 2 }, { total: 4, active: 1 })).toEqual({ total: 7, active: 3, aiCount: 3, searchCount: 4 });
    expect(hubMetrics(undefined, { total: 4, active: 1 })).toEqual({ total: 4, active: 1, aiCount: 0, searchCount: 4 });
    expect(hubMetrics(undefined, undefined)).toEqual({ total: 0, active: 0, aiCount: 0, searchCount: 0 });
  });
});
