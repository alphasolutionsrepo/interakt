import { describe, it, expect } from 'vitest';

import { ResultCaptureStep, _buildSnapshot } from './result-capture.step';

import type { ActionStepContext, ActionStepDeps } from './action-step.types';
import type { ToolExecutionResultV2 } from '../v2.types';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build a context around one tool result — only the fields this step actually
 * reads (`toolResult`, `action.toolSlug`, `turnContext.resultMemory*`) matter.
 */
function context(toolResult: ToolExecutionResultV2 | null): ActionStepContext {
    return {
        action: { toolSlug: 'catalog-find', intent: 'look up item' },
        toolResult,
        turnContext: {
            resultMemory: { sets: {} },
            resultMemoryIndex: [],
        },
    } as unknown as ActionStepContext;
}

const deps = {} as ActionStepDeps;

// ============================================================================
// TESTS
// ============================================================================

describe('ResultCaptureStep — remembering what a tool just found', () => {
    it('indexes a single-record lookup result ({ id, document }), not just arrays', () => {
        // The "find record" tool never returns an array or a `.results` list —
        // without this, a correct, specific lookup was silently dropped from
        // result memory, and the next turn had no durable id to reference.
        const step = new ResultCaptureStep();
        const ctx = context({
            success: true,
            resultCount: 1,
            data: {
                id: 'prod_01ABC',
                document: { name: 'Skyline Fashion Vintage Silk Shirt', price: 151.11 },
            },
        });

        return step.execute(ctx, deps).then((result) => {
            expect(result.context.turnContext.resultMemoryIndex).toHaveLength(1);
            expect(result.context.turnContext.resultMemoryIndex[0]).toMatchObject({
                resultId: 'prod_01ABC',
                snapshot: expect.objectContaining({ name: 'Skyline Fashion Vintage Silk Shirt' }),
            });
            expect(result.context.turnContext.resultMemory.sets['catalog-find'].totalCount).toBe(1);
        });
    });

    it('indexes the items a several-match lookup lists, so "the second one" refers to them', async () => {
        const ctx = context({
            success: true,
            resultCount: 2,
            data: { found: false, requested: 'Crew Neck Sweater', matches: [{ id: 'p1', name: 'Vesper' }, { id: 'p2', name: 'Haven' }] },
        });
        ctx.turnContext.resultMemoryIndex = [{ ordinal: 1, toolSlug: 'catalog-search', resultId: 'old-1', snapshot: {} }];

        const result = await new ResultCaptureStep().execute(ctx, deps);

        expect(result.context.turnContext.resultMemoryIndex.map((e) => e.resultId)).toEqual(['p1', 'p2']);
    });

    it('indexes the closest matches a not-found lookup offers, so "yes, that one" refers to them', async () => {
        const ctx = context({
            success: true,
            resultCount: 0,
            data: { found: false, requested: 'x', closestMatches: [{ id: 'p7', name: 'Streetwear Denim Jacket' }] },
        });

        const result = await new ResultCaptureStep().execute(ctx, deps);

        expect(result.context.turnContext.resultMemoryIndex.map((e) => e.resultId)).toEqual(['p7']);
    });

    it('still indexes array-shaped results unchanged', async () => {
        const step = new ResultCaptureStep();
        const ctx = context({
            success: true,
            resultCount: 2,
            data: [{ id: 'a' }, { id: 'b' }],
        });

        const result = await step.execute(ctx, deps);

        expect(result.context.turnContext.resultMemoryIndex).toHaveLength(2);
    });

    it('still indexes `.results`-shaped results unchanged', async () => {
        const step = new ResultCaptureStep();
        const ctx = context({
            success: true,
            resultCount: 3,
            data: { results: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
        });

        const result = await step.execute(ctx, deps);

        expect(result.context.turnContext.resultMemoryIndex).toHaveLength(3);
    });

    it('does not index a plain object with no id (not a lookup result)', async () => {
        const step = new ResultCaptureStep();
        const ctx = context({
            success: true,
            resultCount: 0,
            data: { message: 'no id here' },
        });

        const result = await step.execute(ctx, deps);

        // Untouched — no results to index, prior index (empty) stands.
        expect(result.context.turnContext.resultMemoryIndex).toHaveLength(0);
    });

    it('skips capture entirely when the tool failed or returned nothing', async () => {
        const step = new ResultCaptureStep();
        const ctx = context({ success: false, resultCount: 0, data: null });

        const result = await step.execute(ctx, deps);

        expect(result.summary).toBe('No results to capture');
        expect(result.context.turnContext.resultMemoryIndex).toHaveLength(0);
    });
});

describe('_buildSnapshot — already handles the lookup shape', () => {
    it('reads display fields out of a nested `document`', () => {
        const snapshot = _buildSnapshot({
            id: 'prod_01ABC',
            document: { name: 'Skyline Fashion Vintage Silk Shirt', price: 151.11 },
        });

        expect(snapshot).toMatchObject({
            id: 'prod_01ABC',
            name: 'Skyline Fashion Vintage Silk Shirt',
            price: 151.11,
        });
    });
});
