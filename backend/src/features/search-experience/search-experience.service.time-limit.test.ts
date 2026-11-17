// src/features/search-experience/search-experience.service.time-limit.test.ts

/**
 * Saving a search experience keeps its query understanding time limit: a new limit is stored,
 * and an edit that doesn't send one (another setting changed) leaves the saved limit as it was.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./search-experience.repository', () => ({
  getSearchExperienceById: vi.fn(),
  isSlugUnique: vi.fn(async () => true),
  updateSearchExperience: vi.fn(async (_id: string, data: unknown) => data),
}));
vi.mock('./search-experience.cache', () => ({ invalidateExperience: vi.fn(async () => {}) }));
vi.mock('@/features/telemetry', () => ({ setExperienceTelemetryOverride: vi.fn() }));
vi.mock('@/features/global-settings', () => ({ getHybridSearchDefaults: vi.fn(async () => ({})) }));

import * as repository from './search-experience.repository';
import { updateSearchExperience } from './search-experience.service';

const saved = (timeoutMs?: number) => ({
  id: 'exp', slug: 'site', accessToken: 'tok', searchConfig: {}, toolsConfig: {},
  aiConfig: {
    enabled: true, providerId: null, modelId: null,
    summary: { enabled: false, maxResultsForContext: 10 },
    queryUnderstanding: { enabled: true, minWords: 3, ...(timeoutMs !== undefined && { timeoutMs }) },
  },
});

const stored = () => (vi.mocked(repository.updateSearchExperience).mock.lastCall?.[1] as unknown as { aiConfig: { queryUnderstanding: Record<string, unknown> } })
  .aiConfig.queryUnderstanding;

beforeEach(() => vi.clearAllMocks());

describe('saving the query understanding time limit', () => {
  it('stores a new limit', async () => {
    vi.mocked(repository.getSearchExperienceById).mockResolvedValue(saved(3000) as never);
    await updateSearchExperience('exp', { aiConfig: { queryUnderstanding: { enabled: true, minWords: 3, timeoutMs: 8000 } } } as never, 'admin');
    expect(stored()).toMatchObject({ timeoutMs: 8000 });
  });

  it('keeps the saved limit when an edit changes another query understanding setting', async () => {
    vi.mocked(repository.getSearchExperienceById).mockResolvedValue(saved(8000) as never);
    await updateSearchExperience('exp', { aiConfig: { queryUnderstanding: { enabled: true, minWords: 5 } } } as never, 'admin');
    expect(stored()).toMatchObject({ minWords: 5, timeoutMs: 8000 });
  });

  it('refuses a limit outside 0.5 to 10 seconds', async () => {
    vi.mocked(repository.getSearchExperienceById).mockResolvedValue(saved() as never);
    await expect(updateSearchExperience('exp', { aiConfig: { queryUnderstanding: { enabled: true, minWords: 3, timeoutMs: 20000 } } } as never, 'admin'))
      .rejects.toThrow();
    expect(repository.updateSearchExperience).not.toHaveBeenCalled();
  });
});
