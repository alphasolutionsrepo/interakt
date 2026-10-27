import { describe, it, expect } from 'vitest';

import { ToolExecutionStep } from './tool-execution.step';

import type { ActionStepContext, ActionStepDeps } from './action-step.types';

function context(executorType: string, operation: string | null): ActionStepContext {
    return {
        action: { toolSlug: 'catalog', intent: 'find items' },
        toolId: 'tool-1',
        toolDef: { slug: 'catalog', executorType, operation },
        validatedParams: { query: 'jacket' },
        extractedParams: null,
    } as unknown as ActionStepContext;
}

const deps = {
    chat: (async () => ({ content: '' })) as unknown as ActionStepDeps['chat'],
    executeTool: async () => ({ success: true, data: { results: [] }, resultCount: 0 }),
    emit: () => {},
    config: {} as ActionStepDeps['config'],
} as ActionStepDeps;

describe('ToolExecutionStep — what kind of tool ran', () => {
    // Reports count a tool call as a search only when its trace says it ran a Search tool
    it('records the tool executor and operation on the span', async () => {
        const result = await new ToolExecutionStep().execute(context('data_source', 'lookup'), deps);

        expect(result.spanAttributes).toMatchObject({
            'alpha.v2.step.tool_executor': 'data_source',
            'alpha.v2.step.tool_operation': 'lookup',
        });
    });

    it('records the executor alone for a tool without an operation', async () => {
        const result = await new ToolExecutionStep().execute(context('http', null), deps);

        expect(result.spanAttributes).toMatchObject({ 'alpha.v2.step.tool_executor': 'http' });
        expect(result.spanAttributes).not.toHaveProperty('alpha.v2.step.tool_operation');
    });
});
