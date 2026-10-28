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
const { executeTool } = vi.hoisted(() => ({ executeTool: vi.fn() }));
vi.mock('@/features/tools/tools.executor', () => ({ executeTool }));

import type { ActionStepContext, ActionStepDeps } from './action-steps/action-step.types';
import { ToolExecutionStep } from './action-steps/tool-execution.step';
import { createProductionV2Deps } from './orchestrator';

describe('production data loader', () => {
  const loader = createProductionV2Deps().contextAssembly.dataSchemaLoader!;

  it("reads a data source's type", async () => {
    getDataSourceById.mockResolvedValueOnce({ id: 'ds-1', name: 'Catalog', type: 'search_index' });

    expect(await loader.loadSourceType('ds-1')).toBe('search_index');
    expect(getDataSourceById).toHaveBeenCalledWith('ds-1');
  });

  it('reads each data source once per turn, for its type and its schema', async () => {
    const turnLoader = createProductionV2Deps().contextAssembly.dataSchemaLoader!;
    getDataSourceById.mockClear().mockResolvedValue({ id: 'ds-2', name: 'Catalog', type: 'search_index', schema: null });

    await turnLoader.loadSourceType('ds-2');
    await turnLoader.loadFieldSchema('ds-2');

    expect(getDataSourceById).toHaveBeenCalledTimes(1);
  });

  it('reads a data source again after a failed read in the same turn', async () => {
    const turnLoader = createProductionV2Deps().contextAssembly.dataSchemaLoader!;
    getDataSourceById.mockClear()
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce({ id: 'ds-3', name: 'Catalog', type: 'search_index', schema: null });

    await expect(turnLoader.loadSourceType('ds-3')).rejects.toThrow('connection reset');
    expect(await turnLoader.loadSourceType('ds-3')).toBe('search_index');
  });

  it('returns null for a data source that does not exist', async () => {
    getDataSourceById.mockResolvedValueOnce(null);

    expect(await loader.loadSourceType('gone')).toBeNull();
  });
});

describe('production tool executor', () => {
  /** Runs one Find Record call through the production executor and the tool step. */
  async function runLookup(data: unknown) {
    executeTool.mockResolvedValueOnce({ success: true, data, durationMs: 5 });
    const deps = {
      executeTool: createProductionV2Deps().executionLoop.executeTool,
      emit: () => {},
    } as unknown as ActionStepDeps;
    const ctx = {
      action: { toolSlug: 'catalog-find', intent: 'find one item' },
      toolId: 'tool-1',
      toolDef: { slug: 'find-product', executorType: 'data_source', operation: 'lookup' },
      validatedParams: { id: 'XYZ-999' },
    } as unknown as ActionStepContext;
    return new ToolExecutionStep().execute(ctx, deps);
  }

  it('counts a lookup that found nothing as zero results', async () => {
    const step = await runLookup({ found: false, requested: 'XYZ-999', message: 'No record matches "XYZ-999".' });

    expect(step.context.toolResult?.resultCount).toBe(0);
    expect(step.summary).toBe('0 result(s) returned');
    expect(step.spanAttributes?.['alpha.v2.step.result_count']).toBe(0);
    // Reports leave lookups out of searches by this
    expect(step.spanAttributes?.['alpha.v2.step.tool_operation']).toBe('lookup');
  });

  it('counts a lookup that several items fit by its matches, as planning does', async () => {
    const step = await runLookup({
      found: false, requested: 'Crew Neck Sweater', message: 'Several records match', matches: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
    });

    expect(step.context.toolResult?.resultCount).toBe(3);
    expect(step.summary).toBe('3 result(s) returned');
  });

  it('counts a lookup that found its record as one result', async () => {
    const step = await runLookup({ id: 'p1', document: { name: 'Denim Jacket' }, matchedBy: 'search_fallback' });

    expect(step.context.toolResult?.resultCount).toBe(1);
    expect(step.summary).toBe('1 result(s) returned');
  });
});
