/**
 * Looking an AI experience up by its access token: a value that can't be a token (not
 * UUID-shaped) matches nothing and never reaches the database, which would refuse it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./ai-experience.repository', () => ({ getAIExperienceByAccessToken: vi.fn() }));
vi.mock('@/features/telemetry', () => ({ setExperienceTelemetryOverride: vi.fn() }));

import * as repository from './ai-experience.repository';
import { getAIExperienceByAccessToken } from './ai-experience.service';

beforeEach(() => vi.clearAllMocks());

describe('getAIExperienceByAccessToken', () => {
  it.each(['x', '', 'not-a-uuid', '3f2b8c1e-5d4a-4b7e-9a1c-2e6f0d8b7a53 '])('answers undefined for %j without asking the repository', async (token) => {
    expect(await getAIExperienceByAccessToken(token)).toBeUndefined();
    expect(repository.getAIExperienceByAccessToken).not.toHaveBeenCalled();
  });

  it('still asks the repository for a well-formed token (a non-v4 one too)', async () => {
    const experience = { id: 'e1', name: 'Shop' };
    vi.mocked(repository.getAIExperienceByAccessToken).mockResolvedValue(experience as never);
    expect(await getAIExperienceByAccessToken('11111111-1111-1111-1111-111111111111')).toEqual(experience);
    expect(repository.getAIExperienceByAccessToken).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
  });

  it('answers undefined for a well-formed token nobody holds', async () => {
    vi.mocked(repository.getAIExperienceByAccessToken).mockResolvedValue(undefined as never);
    expect(await getAIExperienceByAccessToken('22222222-2222-2222-2222-222222222222')).toBeUndefined();
    expect(repository.getAIExperienceByAccessToken).toHaveBeenCalledTimes(1);
  });
});
