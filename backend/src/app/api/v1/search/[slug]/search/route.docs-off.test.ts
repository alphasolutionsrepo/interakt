// src/app/api/v1/search/[slug]/search/route.docs-off.test.ts

/**
 * The built-in docs search before it was ever built: with the Help assistant off, someone
 * signed in is told "turned off" (so the Help drawer says so), not "not found". With it on, or
 * for anyone not signed in, or for any other missing slug, it is the plain "not found".
 */

import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/shared/logger/logger', () => ({ createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
const repo = vi.hoisted(() => ({ getSearchExperienceBySlug: vi.fn() }));
vi.mock('@/features/search-experience/search-experience.repository', () => repo);

import { POST } from './route';

import { TURNED_OFF_CODE } from '@/features/feature-switches/areas';
import { DOCS_SEARCH_SLUG } from '@/shared/help/help-content';
import { accessStub } from '@/shared/test/access-stub';
import { featureSwitchesStub } from '@/shared/test/feature-switches-stub';

const search = (slug: string) => POST(
  new NextRequest(`http://localhost/api/v1/search/${slug}/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'q' }),
  }),
  { params: Promise.resolve({ slug }) },
);

afterEach(() => {
  featureSwitchesStub.reset();
  accessStub.reset();
  vi.clearAllMocks();
});

describe('the docs search that was never built', () => {
  it('is "turned off" to someone signed in when the Help assistant is off', async () => {
    repo.getSearchExperienceBySlug.mockResolvedValue(null);
    featureSwitchesStub.off.add('help-assistant');
    const res = await search(DOCS_SEARCH_SLUG);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: TURNED_OFF_CODE });
  });

  it('is "not found" with the Help assistant on', async () => {
    repo.getSearchExperienceBySlug.mockResolvedValue(null);
    const res = await search(DOCS_SEARCH_SLUG);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('is "not found" to someone not signed in, whatever the switches say', async () => {
    repo.getSearchExperienceBySlug.mockResolvedValue(null);
    featureSwitchesStub.off.add('help-assistant');
    accessStub.session = null;
    accessStub.access = null;
    const res = await search(DOCS_SEARCH_SLUG);
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('is "not found" for any other missing slug, even with the Help assistant off', async () => {
    repo.getSearchExperienceBySlug.mockResolvedValue(null);
    featureSwitchesStub.off.add('help-assistant');
    const res = await search('some-other-slug');
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND' });
  });
});
