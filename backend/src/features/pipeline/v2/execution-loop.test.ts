import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { executeLoop } from './execution-loop';
import { _buildSnapshot } from './action-steps/result-capture.step';
import { _isEmptyResult, _relaxQueryForFilters } from './action-steps/zero-result-retry.step';
import type { ExecutionLoopDeps } from './execution-loop';
import type {
  ExecutionLoopInput,
  TurnContext,
  TurnPlan,
  PlannedAction,
} from './v2.types';
import type { PipelineStreamEvent } from '../pipeline.types';
import type { ChatResult } from '@/features/ai-service/ai-service.types';

// ============================================================================
// FIXTURES
// ============================================================================

function makeTurnContext(overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    userMessage: 'Search for red shoes',
    sessionId: 'session-1',
    experienceId: 'exp-1',
    experienceSlug: 'test',
    sessionFacts: {},
    availableTools: [
      { slug: 'product-search', name: 'Product Search', description: 'Search products', operation: 'search', executorType: 'data_source' },
      { slug: 'add-to-cart', name: 'Add to Cart', description: 'Add to cart', operation: null, executorType: 'http' },
    ],
    conversationHistory: [],
    conversationSummary: null,
    resultMemoryIndex: [],
    resultMemory: { sets: {}, referenceIndex: [] },
    episodicMemories: [],
    turnLog: [],
    toolDefinitions: [
      {
        slug: 'product-search',
        name: 'Product Search',
        description: 'Search products',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Search query' } },
          required: ['query'],
        },
        operation: 'search',
        executorType: 'data_source',
        dataSourceId: 'ds-1',
        displayConfig: null,
      },
      {
        slug: 'add-to-cart',
        name: 'Add to Cart',
        description: 'Add to cart',
        inputSchema: {
          type: 'object',
          properties: { productId: { type: 'string', description: 'Product ID' } },
          required: ['productId'],
        },
        operation: null,
        executorType: 'http',
        dataSourceId: null,
        displayConfig: null,
      },
    ],
    toolSlugToId: { 'product-search': 'tool-1', 'add-to-cart': 'tool-2' },
    toolSlugToName: { 'product-search': 'Product Search', 'add-to-cart': 'Add to Cart' },
    toolSlugToDisplayConfig: {},
    sessionMessageCount: 0,
    userId: null,
    personaInstructions: 'Be helpful',
    businessDomain: null,
    providerId: null,
    modelId: null,
    ...overrides,
  };
}

function makePlan(actions: PlannedAction[]): TurnPlan {
  return {
    actions,
    reasoning: 'test plan',
    directResponse: false,
    needsClarification: false,
    clarificationQuestion: null,
    confidence: 0.9,
  };
}

function makeAction(slug: string, overrides: Partial<PlannedAction> = {}): PlannedAction {
  return {
    toolSlug: slug,
    intent: `Execute ${slug}`,
    hints: {},
    dependsOnPrevious: false,
    ...overrides,
  };
}

function makeChatResultForParams(params: Record<string, unknown>): ChatResult {
  return {
    message: { role: 'assistant', content: JSON.stringify(params) },
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    finishReason: 'stop',
    metadata: { requestId: 'r1', providerId: 'p1', providerKey: 'openai', modelId: 1, modelKey: 'gpt-4o-mini', durationMs: 150 },
  };
}

function makeInput(
  plan: TurnPlan,
  turnContext?: TurnContext,
  overrides?: Partial<ExecutionLoopInput>,
): ExecutionLoopInput {
  return {
    plan,
    turnContext: turnContext ?? makeTurnContext(),
    config: { executionBatchSize: 3, maxRetriesPerAction: 1 },
    emit: vi.fn(),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ExecutionLoopDeps> = {}): ExecutionLoopDeps {
  return {
    chat: vi.fn().mockResolvedValue(makeChatResultForParams({ query: 'red shoes' })),
    executeTool: vi.fn().mockResolvedValue({
      success: true,
      data: [{ id: 'prod-1', title: 'Red Shoes', price: 89 }],
      resultCount: 1,
    }),
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('D2: Execution Loop', () => {
  describe('single action execution', () => {
    it('executes a single action successfully', async () => {
      const plan = makePlan([makeAction('product-search')]);
      const deps = makeDeps();
      const input = makeInput(plan);

      const result = await executeLoop(input, deps);

      expect(result.success).toBe(true);
      expect(result.data!.executedActions).toHaveLength(1);
      expect(result.data!.executedActions[0].toolSlug).toBe('product-search');
      expect(result.data!.executedActions[0].result.success).toBe(true);
      expect(result.data!.remainingActions).toEqual([]);
    });

    it('calls chat for parameter extraction', async () => {
      const plan = makePlan([makeAction('product-search')]);
      const deps = makeDeps();
      await executeLoop(makeInput(plan), deps);

      expect(deps.chat).toHaveBeenCalledOnce();
    });

    it('calls executeTool with correct arguments', async () => {
      const plan = makePlan([makeAction('product-search')]);
      const deps = makeDeps();
      await executeLoop(makeInput(plan), deps);

      expect(deps.executeTool).toHaveBeenCalledWith('tool-1', 'product-search', { query: 'red shoes' });
    });

    it('emits tool_call and tool_result events', async () => {
      const plan = makePlan([makeAction('product-search')]);
      const input = makeInput(plan);
      await executeLoop(input, makeDeps());

      const emit = input.emit as ReturnType<typeof vi.fn>;
      const events = emit.mock.calls.map(([e]: [PipelineStreamEvent]) => e.type);
      expect(events).toContain('tool_call');
      expect(events).toContain('tool_result');
    });
  });

  describe('multi-action execution', () => {
    it('executes multiple actions in sequence', async () => {
      const plan = makePlan([
        makeAction('product-search'),
        makeAction('add-to-cart', { dependsOnPrevious: true }),
      ]);
      const deps = makeDeps({
        chat: vi.fn()
          .mockResolvedValueOnce(makeChatResultForParams({ query: 'red shoes' }))
          .mockResolvedValueOnce(makeChatResultForParams({ productId: 'prod-1' })),
        executeTool: vi.fn()
          .mockResolvedValueOnce({ success: true, data: [{ id: 'prod-1', title: 'Red Shoes' }], resultCount: 1 })
          .mockResolvedValueOnce({ success: true, data: { added: true }, resultCount: undefined }),
      });

      const result = await executeLoop(makeInput(plan), deps);

      expect(result.data!.executedActions).toHaveLength(2);
      expect(result.data!.executedActions[0].toolSlug).toBe('product-search');
      expect(result.data!.executedActions[1].toolSlug).toBe('add-to-cart');
    });

    it('skips dependent action when previous failed', async () => {
      const plan = makePlan([
        makeAction('product-search'),
        makeAction('add-to-cart', { dependsOnPrevious: true }),
      ]);
      const deps = makeDeps({
        chat: vi.fn().mockResolvedValue(makeChatResultForParams({ query: 'shoes' })),
        executeTool: vi.fn().mockResolvedValue({ success: false, data: null, error: 'timeout' }),
      });

      const result = await executeLoop(makeInput(plan), deps);

      // First action executed (failed), second skipped
      expect(result.data!.executedActions).toHaveLength(1);
      expect(deps.executeTool).toHaveBeenCalledOnce();
    });
  });

  describe('batching', () => {
    it('respects batch size limit', async () => {
      const plan = makePlan([
        makeAction('product-search', { intent: 'action 1' }),
        makeAction('product-search', { intent: 'action 2' }),
        makeAction('product-search', { intent: 'action 3' }),
        makeAction('product-search', { intent: 'action 4' }),
      ]);
      const input = makeInput(plan, undefined, {
        config: { executionBatchSize: 2, maxRetriesPerAction: 1 },
      });

      const result = await executeLoop(input, makeDeps());

      expect(result.data!.executedActions).toHaveLength(2);
      expect(result.data!.remainingActions).toHaveLength(2);
      expect(result.data!.remainingActions[0].intent).toBe('action 3');
    });
  });

  describe('parameter extraction retry', () => {
    it('retries extraction when validation fails', async () => {
      // First extraction returns invalid params, second returns valid
      const chatMock = vi.fn()
        .mockResolvedValueOnce(makeChatResultForParams({ query: 'shoes', category: 'Footwear' })) // invalid enum
        .mockResolvedValueOnce(makeChatResultForParams({ query: 'shoes' })); // valid (no category)

      const ctx = makeTurnContext({
        toolDefinitions: [{
          slug: 'product-search',
          name: 'Product Search',
          description: 'Search',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Query' },
              category: { type: 'string', description: 'Cat', enum: ['Electronics', 'Shoes'] },
            },
            required: ['query'],
          },
          operation: 'search',
          executorType: 'data_source',
          dataSourceId: null,
          displayConfig: null,
        }],
      });

      const plan = makePlan([makeAction('product-search')]);
      const deps = makeDeps({ chat: chatMock });

      const result = await executeLoop(makeInput(plan, ctx), deps);

      // Chat called twice (original + retry)
      expect(chatMock).toHaveBeenCalledTimes(2);
      expect(result.data!.executedActions).toHaveLength(1);
      expect(result.data!.executedActions[0].result.success).toBe(true);
    });

    it('skips action when extraction fails after all retries', async () => {
      const chatMock = vi.fn().mockRejectedValue(new Error('AI down'));

      const plan = makePlan([makeAction('product-search')]);
      const deps = makeDeps({ chat: chatMock });

      const result = await executeLoop(makeInput(plan), deps);

      // Action attempted but extraction failed — result recorded with success=false
      expect(result.data!.executedActions).toHaveLength(1);
      expect(result.data!.executedActions[0].result.success).toBe(false);
      expect(deps.executeTool).not.toHaveBeenCalled();
    });
  });

  describe('tool execution failure', () => {
    it('records failure when tool throws', async () => {
      const deps = makeDeps({
        executeTool: vi.fn().mockRejectedValue(new Error('Connection refused')),
      });

      const plan = makePlan([makeAction('product-search')]);
      const result = await executeLoop(makeInput(plan), deps);

      expect(result.data!.executedActions).toHaveLength(1);
      expect(result.data!.executedActions[0].result.success).toBe(false);
      expect(result.data!.executedActions[0].result.error).toContain('Connection refused');
    });
  });

  describe('result capture', () => {
    it('updates result memory after successful tool execution', async () => {
      const ctx = makeTurnContext();
      const plan = makePlan([makeAction('product-search')]);
      const deps = makeDeps({
        executeTool: vi.fn().mockResolvedValue({
          success: true,
          data: [
            { id: 'p1', title: 'Red Shoes', price: 89 },
            { id: 'p2', title: 'Blue Shoes', price: 75 },
          ],
          resultCount: 2,
        }),
      });

      await executeLoop(makeInput(plan, ctx), deps);

      expect(ctx.resultMemory.sets['product-search']).toBeDefined();
      expect(ctx.resultMemory.sets['product-search'].results).toHaveLength(2);
      expect(ctx.resultMemory.referenceIndex).toHaveLength(2);
      expect(ctx.resultMemory.referenceIndex[0].ordinal).toBe(1);
      expect(ctx.resultMemory.referenceIndex[0].resultId).toBe('p1');
    });
  });

  describe('_buildSnapshot', () => {
    it('picks common display fields', () => {
      const snapshot = _buildSnapshot({
        id: '123',
        title: 'Test Product',
        price: 99,
        brand: 'Nike',
        internalId: 'should-be-excluded',
        rawData: { nested: true },
      });

      expect(snapshot.title).toBe('Test Product');
      expect(snapshot.price).toBe(99);
      expect(snapshot.brand).toBe('Nike');
      expect(snapshot.id).toBe('123');
      expect(snapshot).not.toHaveProperty('internalId');
      expect(snapshot).not.toHaveProperty('rawData');
    });

    it('truncates long strings', () => {
      const longDesc = 'a'.repeat(200);
      const snapshot = _buildSnapshot({ description: longDesc });
      expect((snapshot.description as string).length).toBeLessThan(200);
      expect((snapshot.description as string).endsWith('...')).toBe(true);
    });

    it('extracts fields from nested .data (search result shape)', () => {
      const snapshot = _buildSnapshot({
        id: 'PROD-0001',
        score: 3.5,
        data: { name: 'Denim Jacket', brand: 'Haven & Hart', price: 120, category: 'Jackets' },
      });

      expect(snapshot.id).toBe('PROD-0001');
      expect(snapshot.name).toBe('Denim Jacket');
      expect(snapshot.brand).toBe('Haven & Hart');
      expect(snapshot.price).toBe(120);
      expect(snapshot.category).toBe('Jackets');
      expect(snapshot).not.toHaveProperty('score');
    });

    it('extracts fields from nested .document (lookup result shape)', () => {
      const snapshot = _buildSnapshot({
        id: 'PROD-0012',
        document: { name: 'Tailored Blazer', brand: 'Skyline Fashion', price: 325 },
      });

      expect(snapshot.id).toBe('PROD-0012');
      expect(snapshot.name).toBe('Tailored Blazer');
      expect(snapshot.brand).toBe('Skyline Fashion');
    });

    it('prefers top-level fields over nested ones', () => {
      const snapshot = _buildSnapshot({
        id: 'X',
        name: 'Top-level Name',
        data: { name: 'Nested Name', brand: 'Nested Brand' },
      });

      expect(snapshot.name).toBe('Top-level Name');
      expect(snapshot.brand).toBe('Nested Brand');
    });
  });

  describe('module result', () => {
    it('includes duration', async () => {
      const plan = makePlan([makeAction('product-search')]);
      const result = await executeLoop(makeInput(plan), makeDeps());
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('includes summary with counts', async () => {
      const plan = makePlan([makeAction('product-search')]);
      const result = await executeLoop(makeInput(plan), makeDeps());
      expect(result.summary).toContain('1 actions');
    });
  });
});

// ============================================================================
// ZERO-RESULT RETRY HELPERS
// ============================================================================

describe('isEmptyResult', () => {
  it('returns true for resultCount=0', () => {
    expect(_isEmptyResult({ success: true, data: null, resultCount: 0 })).toBe(true);
  });

  it('returns false for resultCount > 0', () => {
    expect(_isEmptyResult({ success: true, data: null, resultCount: 5 })).toBe(false);
  });

  it('returns true for empty array data', () => {
    expect(_isEmptyResult({ success: true, data: [] })).toBe(true);
  });

  it('returns true for empty results array in data', () => {
    expect(_isEmptyResult({ success: true, data: { results: [] } })).toBe(true);
  });

  it('returns false for non-empty array data', () => {
    expect(_isEmptyResult({ success: true, data: [{ id: 1 }] })).toBe(false);
  });

  it('returns true for null data', () => {
    expect(_isEmptyResult({ success: true, data: null })).toBe(true);
  });
});

describe('relaxQueryForFilters', () => {
  it('strips exact filter values from query', () => {
    const result = _relaxQueryForFilters('blue jackets', [
      { field: 'color', value: 'blue' },
    ]);
    expect(result).toBe('jackets');
  });

  it('strips gender synonyms (male → Men filter)', () => {
    const result = _relaxQueryForFilters('male jackets', [
      { field: 'gender', value: 'Men' },
    ]);
    expect(result).toBe('jackets');
  });

  it('strips gender synonyms (female → Women filter)', () => {
    const result = _relaxQueryForFilters("women's running shoes", [
      { field: 'gender', value: 'Women' },
    ]);
    expect(result).toBe('running shoes');
  });

  it('strips filter field names', () => {
    const result = _relaxQueryForFilters('gender jackets size', [
      { field: 'gender', value: 'Men' },
      { field: 'size', value: 'L' },
    ]);
    expect(result).toBe('jackets');
  });

  it('returns null if all words stripped', () => {
    const result = _relaxQueryForFilters('men', [
      { field: 'gender', value: 'Men' },
    ]);
    expect(result).toBeNull();
  });

  it('returns same query if no filter values match', () => {
    const result = _relaxQueryForFilters('leather jackets', [
      { field: 'maxPrice', value: 300 },
    ]);
    expect(result).toBe('leather jackets');
  });

  it('is case insensitive', () => {
    const result = _relaxQueryForFilters('Men Jackets', [
      { field: 'gender', value: 'men' },
    ]);
    expect(result).toBe('Jackets');
  });

  it('handles multiple filters stripping multiple words', () => {
    const result = _relaxQueryForFilters('red large sneakers', [
      { field: 'color', value: 'red' },
      { field: 'size', value: 'large' },
    ]);
    expect(result).toBe('sneakers');
  });
});
