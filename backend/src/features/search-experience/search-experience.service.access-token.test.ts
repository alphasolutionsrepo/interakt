/**
 * Looking a search experience up by its access token: a value that can't be a token (not
 * UUID-shaped) is refused as an invalid token and never reaches the database, which would
 * refuse the query instead.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./search-experience.repository', () => ({ getSearchExperienceByAccessToken: vi.fn() }));
vi.mock('@/features/telemetry', () => ({ setExperienceTelemetryOverride: vi.fn() }));
vi.mock('@/features/global-settings', () => ({ getHybridSearchDefaults: vi.fn(async () => ({})) }));

import * as repository from './search-experience.repository';
import { getSearchExperienceByAccessToken, UnauthorizedError } from './search-experience.service';

beforeEach(() => vi.clearAllMocks());

describe('getSearchExperienceByAccessToken', () => {
  it.each(['x', 'not-a-uuid', '3f2b8c1e-5d4a-4b7e-9a1c-2e6f0d8b7a53 '])('refuses %j as an invalid token without asking the repository', async (token) => {
    await expect(getSearchExperienceByAccessToken(token)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(getSearchExperienceByAccessToken(token)).rejects.toThrow('Invalid access token');
    expect(repository.getSearchExperienceByAccessToken).not.toHaveBeenCalled();
  });

  it('still says a token is required when there is none', async () => {
    await expect(getSearchExperienceByAccessToken('')).rejects.toThrow('Access token is required');
  });

  it('still asks the repository for a well-formed token (a non-v4 one too)', async () => {
    const experience = { id: 's1', isActive: true, indexes: [] };
    vi.mocked(repository.getSearchExperienceByAccessToken).mockResolvedValue(experience as never);
    expect(await getSearchExperienceByAccessToken('33333333-3333-3333-3333-333333333333')).toEqual(experience);
    expect(repository.getSearchExperienceByAccessToken).toHaveBeenCalledWith('33333333-3333-3333-3333-333333333333');
  });

  it('refuses a well-formed token nobody holds as invalid', async () => {
    vi.mocked(repository.getSearchExperienceByAccessToken).mockResolvedValue(undefined as never);
    await expect(getSearchExperienceByAccessToken('44444444-4444-4444-4444-444444444444')).rejects.toThrow('Invalid access token');
    expect(repository.getSearchExperienceByAccessToken).toHaveBeenCalledTimes(1);
  });
});
