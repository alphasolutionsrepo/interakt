// src/features/pipeline/v2/parameter-context.trigger.test.ts

/**
 * Before the AI fills in a Search tool's filters, the chat loads the fields' values. That is a
 * fixed AI step, not the List Values tool, and its searches are recorded as such.
 */

import { describe, it, expect, vi } from 'vitest';

const { executeDataSourceEnumerate } = vi.hoisted(() => ({
  executeDataSourceEnumerate: vi.fn(async () => ({ success: true, data: { values: [{ value: 'Navy', count: 3 }] } })),
}));
vi.mock('@/features/tools/executors/data-source/enumerate', () => ({ executeDataSourceEnumerate }));

import { _DataSourceSearchProvider } from './parameter-context.provider';

describe('loading filter values for a Search tool', () => {
  it('records its searches as the chat’s filter-values step', async () => {
    const provider = new _DataSourceSearchProvider() as unknown as {
      fetchFacetValues(dataSourceId: string, fields: string[]): Promise<Record<string, string[]>>;
    };

    expect(await provider.fetchFacetValues('ds', ['colour'])).toEqual({ colour: ['Navy'] });
    expect(executeDataSourceEnumerate).toHaveBeenCalledWith(
      'ds',
      expect.anything(),
      { field: 'colour', maxValues: 100 },
      { triggerType: 'ai_step', triggerStep: 'parameter_context' },
    );
  });
});
