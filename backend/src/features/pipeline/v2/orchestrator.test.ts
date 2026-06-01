import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Every pipeline phase reaches resolveTemplate() (a DB query); unit tests are
// DB-free, so force the deterministic inline-prompt fallback (null template).
// Without this the postgres client hangs on connect in CI and the test times out.
vi.mock('@/features/prompt-templates', () => ({
  resolveTemplate: vi.fn().mockResolvedValue(null),
  renderTemplate: vi.fn((content: string) => content),
}));

import { runV2Pipeline } from './orchestrator';
import type { V2PipelineInput, V2PipelineDeps } from './orchestrator';
import type { PipelineStreamEvent } from '../pipeline.types';
import type { ChatResult } from '@/features/ai-service/ai-service.types';

// ============================================================================
// FIXTURES
// ============================================================================

function makeExperience(): V2PipelineInput['experience'] {
  return {
    id: 'exp-1',
    slug: 'test-exp',
    providerId: 'p1',
    modelId: 1,
    personaConfig: {
      systemInstructions: 'Be helpful.',
      businessDomains: ['E-commerce'],
      tone: 'friendly',
      name: 'TestBot',
      responseFormats: { enabledPresets: ['rich_text', 'item_grid'], defaultPreset: 'rich_text' },
    },
    sessionConfig: { maxContextMessages: 6 },
    tools: [{
      isEnabled: true,
      overrideAiDescription: null,
      tool: {
        id: 'tool-1',
        name: 'product-search',
        slug: 'product-search',
        executorType: 'data_source',
        operation: 'search',
        aiDescription: 'Search for products',
        inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search query' } }, required: ['query'] },
        isActive: true,
        dataSourceId: 'ds-1',
        displayConfig: null,
      },
    }],
  };
}

function makeInput(overrides: Partial<V2PipelineInput> = {}): V2PipelineInput {
  return {
    experience: makeExperience(),
    message: 'Search for red shoes',
    sessionId: 'session-1',
    onEvent: vi.fn(),
    ...overrides,
  };
}

function makeChatResult(content: string): ChatResult {
  return {
    message: { role: 'assistant', content },
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    finishReason: 'stop',
    metadata: { requestId: 'r1', providerId: 'p1', providerKey: 'openai', modelId: 1, modelKey: 'gpt-4o', durationMs: 200 },
  };
}

function makeDeps(): V2PipelineDeps {
  // Chat mock: responds differently based on context
  // Call 1: Turn Planner → plan with 1 action
  // Call 2: Param Extraction → { query: "red shoes" }
  // Call 3: Synthesis → response text
  const chatMock = vi.fn()
    .mockResolvedValueOnce(makeChatResult(JSON.stringify({
      actions: [{ toolSlug: 'product-search', intent: 'Search for red shoes', hints: '{"query":"red shoes"}', dependsOnPrevious: false }],
      reasoning: 'User wants to search',
      directResponse: false,
      needsClarification: false,
      clarificationQuestion: null,
      confidence: 0.95,
    })))
    .mockResolvedValueOnce(makeChatResult(JSON.stringify({ query: 'red shoes' })))
    .mockResolvedValueOnce(makeChatResult('I found some red shoes for you!'));

  return {
    contextAssembly: {
      sessionLoader: {
        getSessionWithWindow: vi.fn().mockResolvedValue({
          session: { id: 'session-1', summary: null, facts: null, pipelineState: null, userContext: null, messageCount: 0, status: 'active' },
          messages: [],
        }),
        createSession: vi.fn(),
      },
      episodicMemoryLoader: {
        retrieveRelevantMemories: vi.fn().mockResolvedValue([]),
      },
    },
    turnPlanner: { chat: chatMock },
    executionLoop: {
      chat: chatMock,
      executeTool: vi.fn().mockResolvedValue({
        success: true,
        data: [{ id: 'p1', title: 'Red Shoes', price: 89 }],
        resultCount: 1,
      }),
    },
    synthesis: { chat: chatMock },
    persistence: {
      addMessages: vi.fn().mockResolvedValue(undefined),
      updateSession: vi.fn().mockResolvedValue(undefined),
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('V2 Pipeline Orchestrator', () => {
  describe('full pipeline — single action', () => {
    it('runs S2 → D1 → D2 → D3 → D4 and returns response', async () => {
      const input = makeInput();
      const deps = makeDeps();

      const result = await runV2Pipeline(input, deps);

      expect(result.sessionId).toBe('session-1');
      expect(result.responseText).toBe('I found some red shoes for you!');
    });

    it('emits step_start and step_complete events for each phase', async () => {
      const input = makeInput();
      const deps = makeDeps();
      await runV2Pipeline(input, deps);

      const events = (input.onEvent as ReturnType<typeof vi.fn>).mock.calls.map(([e]: [PipelineStreamEvent]) => e);
      const stepStarts = events.filter((e: PipelineStreamEvent) => e.type === 'step_start');
      const stepCompletes = events.filter((e: PipelineStreamEvent) => e.type === 'step_complete');

      // S2 + D1 + D2 + D3 = 4 step starts
      expect(stepStarts.length).toBeGreaterThanOrEqual(4);
      expect(stepCompletes.length).toBeGreaterThanOrEqual(4);
    });

    it('emits done event at the end', async () => {
      const input = makeInput();
      await runV2Pipeline(input, makeDeps());

      const events = (input.onEvent as ReturnType<typeof vi.fn>).mock.calls.map(([e]: [PipelineStreamEvent]) => e);
      const lastEvent = events[events.length - 1];
      expect(lastEvent.type).toBe('done');
    });

    it('persists messages after synthesis', async () => {
      const deps = makeDeps();
      await runV2Pipeline(makeInput(), deps);

      expect(deps.persistence.addMessages).toHaveBeenCalledOnce();
      const [sessionId, messages] = (deps.persistence.addMessages as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sessionId).toBe('session-1');
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
    });
  });

  describe('direct response (greeting)', () => {
    it('skips execution loop for direct responses', async () => {
      const chatMock = vi.fn()
        // D1: direct response
        .mockResolvedValueOnce(makeChatResult(JSON.stringify({
          actions: [],
          reasoning: 'greeting',
          directResponse: true,
          needsClarification: false,
          clarificationQuestion: null,
          confidence: 0.99,
        })))
        // D3: synthesis
        .mockResolvedValueOnce(makeChatResult('Hello! How can I help you today?'));

      const deps = makeDeps();
      deps.turnPlanner = { chat: chatMock };
      deps.synthesis = { chat: chatMock };

      const result = await runV2Pipeline(
        makeInput({ message: 'Hello!' }),
        deps,
      );

      expect(result.responseText).toBe('Hello! How can I help you today?');
      // executeTool should NOT be called
      expect(deps.executionLoop.executeTool).not.toHaveBeenCalled();
    });
  });

  describe('planning failure', () => {
    it('returns fallback response and still persists', async () => {
      const chatMock = vi.fn().mockRejectedValue(new Error('AI unavailable'));

      const deps = makeDeps();
      deps.turnPlanner = { chat: chatMock };

      const result = await runV2Pipeline(makeInput(), deps);

      expect(result.responseText).toContain('trouble understanding');
      // Should still persist the fallback
      expect(deps.persistence.addMessages).toHaveBeenCalled();
    });
  });

  describe('context assembly failure', () => {
    it('emits error and returns early', async () => {
      const deps = makeDeps();
      deps.contextAssembly.sessionLoader.getSessionWithWindow = vi.fn().mockRejectedValue(new Error('DB down'));
      deps.contextAssembly.sessionLoader.createSession = vi.fn().mockRejectedValue(new Error('DB down'));

      const input = makeInput({ sessionId: '' });
      const result = await runV2Pipeline(input, deps);

      expect(result.responseText).toBe('');
      const events = (input.onEvent as ReturnType<typeof vi.fn>).mock.calls.map(([e]: [PipelineStreamEvent]) => e);
      expect(events.some((e: PipelineStreamEvent) => e.type === 'error')).toBe(true);
    });
  });
});
