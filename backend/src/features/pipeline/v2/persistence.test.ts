import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { persistTurn } from './persistence';
import type { PersistenceDeps } from './persistence';
import type { PersistenceInput } from './v2.types';

// ============================================================================
// FIXTURES
// ============================================================================

function makeInput(overrides: Partial<PersistenceInput> = {}): PersistenceInput {
  return {
    sessionId: 'session-1',
    userMessage: 'Search for red shoes',
    synthesisResult: {
      responseText: 'I found 2 pairs of red shoes for you.',
      preset: 'item_grid',
      presetPayload: undefined,
      responseMetadata: {
        sources: ['product-search'],
        suggestedActions: undefined,
      },
    },
    actionResults: [
      {
        toolSlug: 'product-search',
        toolId: 'tool-1',
        toolName: 'Product Search',
        intent: 'Search for red shoes',
        parameters: { query: 'red shoes' },
        result: { success: true, data: [{ id: 'p1' }, { id: 'p2' }], resultCount: 2 },
        durationMs: 500,
      },
    ],
    resultMemory: {
      sets: { 'product-search': { toolSlug: 'product-search', executedAt: '2026-03-13T10:00:00Z', results: [], totalCount: 2 } },
      referenceIndex: [{ ordinal: 1, toolSlug: 'product-search', resultId: 'p1', snapshot: {} }],
    },
    sessionFacts: { preferredColor: 'red' },
    tokenUsage: { promptTokens: 500, completionTokens: 150, totalTokens: 650 },
    turnLog: [],
    ...overrides,
  };
}

function makeDeps(overrides: Partial<PersistenceDeps> = {}): PersistenceDeps {
  return {
    addMessages: vi.fn().mockResolvedValue(undefined),
    updateSession: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('D4: Persistence', () => {
  describe('persistTurn — messages', () => {
    it('persists user and assistant messages', async () => {
      const deps = makeDeps();
      await persistTurn(makeInput(), deps);

      expect(deps.addMessages).toHaveBeenCalledOnce();
      const [sessionId, messages] = (deps.addMessages as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sessionId).toBe('session-1');
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Search for red shoes');
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].content).toBe('I found 2 pairs of red shoes for you.');
    });

    it('includes metadata on assistant message', async () => {
      const deps = makeDeps();
      await persistTurn(makeInput(), deps);

      const [, messages] = (deps.addMessages as ReturnType<typeof vi.fn>).mock.calls[0];
      const assistantMeta = messages[1].metadata;
      expect(assistantMeta.tokenUsage).toBeDefined();
      expect(assistantMeta.responseData.preset).toBe('item_grid');
      expect(assistantMeta.sources).toEqual(['product-search']);
    });

    it('omits responseData for rich_text preset', async () => {
      const deps = makeDeps();
      const input = makeInput({
        synthesisResult: {
          responseText: 'Hello!',
          preset: 'rich_text',
          responseMetadata: {},
        },
      });
      await persistTurn(input, deps);

      const [, messages] = (deps.addMessages as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(messages[1].metadata.responseData).toBeUndefined();
    });
  });

  describe('persistTurn — session state', () => {
    it('updates pipeline state with result memory', async () => {
      const deps = makeDeps();
      await persistTurn(makeInput(), deps);

      expect(deps.updateSession).toHaveBeenCalledOnce();
      const [, updates] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updates.pipelineState.result_memory).toBeDefined();
      expect(updates.pipelineState.result_memory.referenceIndex).toHaveLength(1);
    });

    it('updates session facts', async () => {
      const deps = makeDeps();
      await persistTurn(makeInput(), deps);

      const [, updates] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updates.facts).toEqual({ preferredColor: 'red' });
    });

    it('updates lastToolResults from successful actions', async () => {
      const deps = makeDeps();
      await persistTurn(makeInput(), deps);

      const [, updates] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updates.lastToolResults).toBeDefined();
      expect(updates.lastToolResults['product-search']).toBeDefined();
    });

    it('omits lastToolResults when no successful actions', async () => {
      const deps = makeDeps();
      const input = makeInput({
        actionResults: [{
          toolSlug: 'x',
          toolId: 'tool-x',
          toolName: 'X Tool',
          intent: 'fail',
          parameters: {},
          result: { success: false, data: null, error: 'timeout' },
          durationMs: 100,
        }],
      });
      await persistTurn(input, deps);

      const [, updates] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updates.lastToolResults).toBeUndefined();
    });
  });

  describe('persistTurn — error handling', () => {
    it('returns failure when addMessages throws', async () => {
      const deps = makeDeps({
        addMessages: vi.fn().mockRejectedValue(new Error('DB write failed')),
      });

      const result = await persistTurn(makeInput(), deps);
      expect(result.success).toBe(false);
      expect(result.summary).toContain('DB write failed');
    });

    it('returns failure when updateSession throws', async () => {
      const deps = makeDeps({
        updateSession: vi.fn().mockRejectedValue(new Error('DB update failed')),
      });

      const result = await persistTurn(makeInput(), deps);
      expect(result.success).toBe(false);
    });
  });

  describe('module result', () => {
    it('returns success with duration', async () => {
      const result = await persistTurn(makeInput(), makeDeps());
      expect(result.success).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.summary).toContain('1 actions');
    });
  });
});
