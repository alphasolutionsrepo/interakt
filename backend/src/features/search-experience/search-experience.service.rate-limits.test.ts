// src/features/search-experience/search-experience.service.rate-limits.test.ts

/**
 * Saving a search experience keeps its rate limits: the summary limit is stored on create and on
 * an edit, and an old chatPerMinute sent with them is dropped.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./search-experience.repository', () => ({
  getSearchExperienceById: vi.fn(),
  isSlugUnique: vi.fn(async () => true),
  searchIndexExists: vi.fn(async () => true),
  externalIndexExists: vi.fn(async () => true),
  createSearchExperienceWithIndexes: vi.fn(async (data: object) => ({ id: 'exp', indexes: [], ...data })),
  updateSearchExperience: vi.fn(async (_id: string, data: unknown) => data),
}));
vi.mock('./search-experience.cache', () => ({ invalidateExperience: vi.fn(async () => {}) }));
vi.mock('@/features/telemetry', () => ({ setExperienceTelemetryOverride: vi.fn() }));
vi.mock('@/features/global-settings', () => ({ getHybridSearchDefaults: vi.fn(async () => ({})) }));

import * as repository from './search-experience.repository';
import { createSearchExperience, updateSearchExperience } from './search-experience.service';

const INDEX = '6f1c9a52-6b6e-4f3e-9d2a-0d1f2b3c4d5e';

beforeEach(() => vi.clearAllMocks());

describe('saving rate limits', () => {
  it('stores the summary limit when an experience is created', async () => {
    await createSearchExperience({
      name: 'Catalog', slug: 'catalog', indexes: [{ searchIndexId: INDEX }],
      rateLimitConfig: { searchPerMinute: 60, summaryPerMinute: 10, chatPerMinute: 30 },
    } as never, 'admin');
    const saved = vi.mocked(repository.createSearchExperienceWithIndexes).mock.lastCall?.[0];
    expect(saved?.rateLimitConfig).toEqual({ searchPerMinute: 60, summaryPerMinute: 10 });
  });

  it('stores the summary limit when an experience is edited', async () => {
    vi.mocked(repository.getSearchExperienceById).mockResolvedValue({
      id: 'exp', slug: 'catalog', accessToken: 'tok', searchConfig: {}, toolsConfig: {}, aiConfig: {},
      rateLimitConfig: { searchPerMinute: 60 },
    } as never);
    await updateSearchExperience('exp', { rateLimitConfig: { searchPerMinute: 40, summaryPerMinute: 5, chatPerMinute: 30 } } as never, 'admin');
    const saved = vi.mocked(repository.updateSearchExperience).mock.lastCall?.[1] as { rateLimitConfig?: unknown };
    expect(saved.rateLimitConfig).toEqual({ searchPerMinute: 40, summaryPerMinute: 5 });
  });
});
