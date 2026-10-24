// src/features/pipeline/v2/orchestrator.production-deps.test.ts

/**
 * The production data loader tells context assembly each data source's type, which decides
 * whether the planner may send a name to a lookup tool (search index) or only an id (files).
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/features/prompt-templates', () => ({
  resolveTemplate: vi.fn().mockResolvedValue(null),
  renderTemplate: vi.fn((content: string) => content),
}));
const { getDataSourceById } = vi.hoisted(() => ({ getDataSourceById: vi.fn() }));
vi.mock('@/features/data-source/data-source.service', () => ({ getDataSourceById }));

import { createProductionV2Deps } from './orchestrator';

describe('production data loader', () => {
  const loader = createProductionV2Deps().contextAssembly.dataSchemaLoader!;

  it("reads a data source's type", async () => {
    getDataSourceById.mockResolvedValueOnce({ id: 'ds-1', name: 'Catalog', type: 'search_index' });

    expect(await loader.loadSourceType('ds-1')).toBe('search_index');
    expect(getDataSourceById).toHaveBeenCalledWith('ds-1');
  });

  it('returns null for a data source that does not exist', async () => {
    getDataSourceById.mockResolvedValueOnce(null);

    expect(await loader.loadSourceType('gone')).toBeNull();
  });
});
