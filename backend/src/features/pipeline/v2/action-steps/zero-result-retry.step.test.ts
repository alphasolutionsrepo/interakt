import { describe, it, expect } from 'vitest';

import { ZeroResultRetryStep } from './zero-result-retry.step';

import type { ActionStepContext, ActionStepDeps } from './action-step.types';
import type { ToolExecutionResultV2 } from '../v2.types';

// ============================================================================
// HELPERS
// ============================================================================

const empty: ToolExecutionResultV2 = { success: true, data: { results: [] }, resultCount: 0 };
const hit = (n: number): ToolExecutionResultV2 => ({
    success: true,
    data: { results: Array.from({ length: n }, (_, i) => ({ id: i })) },
    resultCount: n,
});

/**
 * Build a context for a search that came back empty with filters applied —
 * the only situation this step acts on.
 */
function context(filters: Array<{ field: string; operator: string; value: unknown }>): ActionStepContext {
    return {
        action: { toolSlug: 'catalog-search', intent: 'find items' },
        toolId: 'tool-1',
        toolResult: empty,
        finalParams: { query: 'mens t-shirt', filters },
        validatedParams: null,
        extractedParams: null,
    } as unknown as ActionStepContext;
}

/**
 * Deps whose executor answers according to `respond`, so a test can decide which
 * relaxation attempt finally succeeds.
 */
function deps(respond: (params: Record<string, unknown>) => ToolExecutionResultV2): ActionStepDeps {
    return {
        chat: (async () => ({ content: '' })) as unknown as ActionStepDeps['chat'],
        executeTool: async (_id: string, _slug: string, params: Record<string, unknown>) => respond(params),
        emit: () => {},
        config: {} as ActionStepDeps['config'],
    };
}

const filterCount = (params: Record<string, unknown>) =>
    Array.isArray(params.filters) ? (params.filters as unknown[]).length : 0;

// ============================================================================
// TESTS
// ============================================================================

describe('ZeroResultRetryStep — reporting what it gave up', () => {
    it('reports the filter it dropped to get results', async () => {
        // "under $60" matched nothing, so the price filter is dropped. Returning
        // full-price items without saying so reads as a broken filter.
        const step = new ZeroResultRetryStep();
        const ctx = context([
            { field: 'gender', operator: 'eq', value: 'Men' },
            { field: 'maxPrice', operator: 'lte', value: 60 },
        ]);

        const result = await step.execute(ctx, deps(params => (filterCount(params) < 2 ? hit(7) : empty)));

        expect(result.context.relaxation).toBeDefined();
        expect(result.context.relaxation?.droppedFilters).toEqual(['maxPrice=60']);
        expect(result.context.relaxation?.droppedAll).toBe(false);
    });

    it('flags when every filter was abandoned', async () => {
        const step = new ZeroResultRetryStep();
        const ctx = context([
            { field: 'gender', operator: 'eq', value: 'Men' },
            { field: 'maxPrice', operator: 'lte', value: 60 },
        ]);

        // Only the no-filter semantic fallback returns anything.
        const result = await step.execute(ctx, deps(params => (filterCount(params) === 0 ? hit(20) : empty)));

        expect(result.context.relaxation?.droppedAll).toBe(true);
        expect(result.context.relaxation?.droppedFilters).toEqual(
            expect.arrayContaining(['gender=Men', 'maxPrice=60'])
        );
    });

    it('reports nothing when no relaxation was needed', async () => {
        const step = new ZeroResultRetryStep();
        const ctx = {
            ...context([{ field: 'gender', operator: 'eq', value: 'Men' }]),
            toolResult: hit(11),
        } as ActionStepContext;

        const result = await step.execute(ctx, deps(() => hit(11)));

        expect(result.context.relaxation).toBeUndefined();
    });

    it('reports nothing when relaxation failed to find anything either', async () => {
        // Every attempt is empty, so the original filters still stand — there is
        // no wrong answer to warn about, just an empty result set.
        const step = new ZeroResultRetryStep();
        const ctx = context([{ field: 'gender', operator: 'eq', value: 'Men' }]);

        const result = await step.execute(ctx, deps(() => empty));

        expect(result.context.relaxation).toBeUndefined();
    });

    it('records the dropped filters on the span', async () => {
        const step = new ZeroResultRetryStep();
        const ctx = context([
            { field: 'gender', operator: 'eq', value: 'Men' },
            { field: 'maxPrice', operator: 'lte', value: 60 },
        ]);

        const result = await step.execute(ctx, deps(params => (filterCount(params) < 2 ? hit(7) : empty)));

        expect(result.spanAttributes?.['alpha.v2.step.dropped_filters']).toBe(
            JSON.stringify(['maxPrice=60'])
        );
    });
});
