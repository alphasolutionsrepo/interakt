// src/features/pipeline/v2/tool-analytics.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const trackToolExecution = vi.fn();
vi.mock('@/features/analytics', () => ({
  trackToolExecution: (...args: unknown[]) => trackToolExecution(...args),
}));

import { withToolAnalytics, toolCategoryFor, summariseInput } from './tool-analytics';
import type { TurnContext, ToolDefinitionV2 } from './v2.types';

function toolDef(overrides: Partial<ToolDefinitionV2> = {}): ToolDefinitionV2 {
  return {
    slug: 'catalog-search',
    name: 'Catalog Search',
    description: 'search',
    inputSchema: { type: 'object', properties: {} },
    operation: 'search',
    executorType: 'data_source',
    dataSourceId: 'ds-1',
    displayConfig: null,
    ...overrides,
  };
}

function turnContext(defs: ToolDefinitionV2[] = [toolDef()]): TurnContext {
  return {
    sessionId: 'session-1',
    experienceId: 'exp-1',
    toolDefinitions: defs,
  } as unknown as TurnContext;
}

beforeEach(() => trackToolExecution.mockClear());

describe('toolCategoryFor', () => {
  it('classifies read-only executors as retrieval', () => {
    expect(toolCategoryFor('data_source')).toBe('retrieval');
    expect(toolCategoryFor('web_search')).toBe('retrieval');
    expect(toolCategoryFor('ai_call')).toBe('retrieval');
  });

  it('classifies executors that may have side effects as action', () => {
    // Conservative on purpose: over-reporting a read as an action is less
    // misleading than the reverse when auditing what the assistant did.
    expect(toolCategoryFor('http')).toBe('action');
    expect(toolCategoryFor('mcp')).toBe('action');
    expect(toolCategoryFor(undefined)).toBe('action');
  });
});

describe('summariseInput', () => {
  it('records the shape of the call, not the whole payload', () => {
    const summary = summariseInput({
      query: 'cashmere sweater',
      filters: [{ field: 'brand', operator: 'eq', value: 'Vesper' }, { field: 'price', operator: 'lt', value: 200 }],
      secretish: 'should not be copied verbatim',
    });

    expect(summary.query).toBe('cashmere sweater');
    expect(summary.filterCount).toBe(2);
    expect(summary.filterFields).toEqual(['brand', 'price']);
    expect(summary.paramKeys).toContain('secretish');
    // Values of unrecognised params are not copied into the analytics row.
    expect(JSON.stringify(summary)).not.toContain('should not be copied');
  });

  it('records the field name for enumerate-style calls', () => {
    expect(summariseInput({ field: 'author' }).field).toBe('author');
  });

  it('handles a parameterless call', () => {
    expect(summariseInput({})).toEqual({ paramKeys: [] });
  });
});

describe('withToolAnalytics', () => {
  it('tracks a successful execution and passes the result through untouched', async () => {
    const inner = vi.fn().mockResolvedValue({ success: true, data: { results: [1, 2] }, resultCount: 2 });
    const wrapped = withToolAnalytics(inner, turnContext(), 'turn-req-1');

    const result = await wrapped('tool-1', 'catalog-search', { query: 'jeans' });

    expect(result).toEqual({ success: true, data: { results: [1, 2] }, resultCount: 2 });
    expect(trackToolExecution).toHaveBeenCalledOnce();
    const event = trackToolExecution.mock.calls[0][0];
    expect(event.aiRequestId).toBe('turn-req-1');
    expect(event.sessionId).toBe('session-1');
    expect(event.toolName).toBe('catalog-search');
    expect(event.toolCategory).toBe('retrieval');
    expect(event.success).toBe(true);
    expect(event.outputSummary.resultCount).toBe(2);
    expect(event.metadata.experienceId).toBe('exp-1');
    expect(event.metadata.operation).toBe('search');
  });

  it('tracks a failed execution with its error message', async () => {
    const inner = vi.fn().mockResolvedValue({ success: false, data: null, error: 'HTTP 400: bad filter' });
    const wrapped = withToolAnalytics(inner, turnContext(), 'turn-req-1');

    await wrapped('tool-1', 'catalog-search', {});

    const event = trackToolExecution.mock.calls[0][0];
    expect(event.success).toBe(false);
    expect(event.errorMessage).toBe('HTTP 400: bad filter');
    expect(event.outputSummary.failed).toBe(true);
  });

  it('tracks a thrown executor and still rethrows', async () => {
    // A throw is still an execution that consumed time and produced no answer —
    // omitting it would make a broken tool invisible in reliability views.
    const inner = vi.fn().mockRejectedValue(new Error('socket hang up'));
    const wrapped = withToolAnalytics(inner, turnContext(), 'turn-req-1');

    await expect(wrapped('tool-1', 'catalog-search', {})).rejects.toThrow('socket hang up');

    expect(trackToolExecution).toHaveBeenCalledOnce();
    const event = trackToolExecution.mock.calls[0][0];
    expect(event.success).toBe(false);
    expect(event.errorMessage).toBe('socket hang up');
  });

  it('records every execution, so filter-relaxation retries are counted', async () => {
    // ZeroResultRetryStep re-executes the tool up to three more times. Those are
    // real calls; wrapping the executor is what makes them visible.
    const inner = vi.fn()
      .mockResolvedValueOnce({ success: true, data: { results: [] }, resultCount: 0 })
      .mockResolvedValueOnce({ success: true, data: { results: [1] }, resultCount: 1 });
    const wrapped = withToolAnalytics(inner, turnContext(), 'turn-req-1');

    await wrapped('tool-1', 'catalog-search', { filters: [{ field: 'brand' }] });
    await wrapped('tool-1', 'catalog-search', {});

    expect(trackToolExecution).toHaveBeenCalledTimes(2);
    // Both belong to the same turn, so tool usage can be grouped per turn.
    const ids = trackToolExecution.mock.calls.map((c) => c[0].aiRequestId);
    expect(ids).toEqual(['turn-req-1', 'turn-req-1']);
  });

  it('never lets an analytics failure affect the tool result', async () => {
    trackToolExecution.mockImplementationOnce(() => {
      throw new Error('analytics queue exploded');
    });
    const inner = vi.fn().mockResolvedValue({ success: true, data: { results: [1] }, resultCount: 1 });
    const wrapped = withToolAnalytics(inner, turnContext(), 'turn-req-1');

    await expect(wrapped('tool-1', 'catalog-search', {})).resolves.toEqual({
      success: true,
      data: { results: [1] },
      resultCount: 1,
    });
  });

  it('falls back to action when the tool definition is unknown', async () => {
    const inner = vi.fn().mockResolvedValue({ success: true, data: {}, resultCount: 0 });
    const wrapped = withToolAnalytics(inner, turnContext([]), 'turn-req-1');

    await wrapped('tool-x', 'not-in-context', {});

    const event = trackToolExecution.mock.calls[0][0];
    expect(event.toolCategory).toBe('action');
    expect(event.metadata.executorType).toBe('unknown');
  });
});
