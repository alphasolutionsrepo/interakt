// src/features/search-experience/search-experience.generate-instructions.test.ts

/**
 * Generating instructions for an experience whose indexes are all gone is refused as not
 * found, so the admin hears that, not a server error.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/features/global-settings', () => ({ getHybridSearchDefaults: vi.fn() }));
vi.mock('@/features/telemetry', () => ({ setExperienceTelemetryOverride: vi.fn() }));
vi.mock('./search-experience.repository', () => ({}));
vi.mock('./search-experience.cache', () => ({}));
vi.mock('@/features/search-index/search-index.service', () => ({ getSearchIndexById: async () => null }));
vi.mock('@/features/data-source/data-source.service', () => ({ getDataSourceById: async () => null }));
vi.mock('@/features/ai-service/ai-service.service', () => ({ generateText: vi.fn() }));
vi.mock('@/features/chat/prompts', () => ({ getGenerateCustomInstructionsPrompt: () => '' }));

import { generateCustomInstructions } from './search-experience.service';

describe('generating instructions when none of the indexes exist', () => {
  it('is refused as not found', async () => {
    await expect(generateCustomInstructions({
      experienceName: 'Catalog',
      indexIds: ['7f1c0c56-3a9e-4a51-9b3f-2f7b8c1d2e3f'],
      type: 'summary',
    } as never)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404, message: 'None of the selected indexes could be found' });
  });
});
