import { trace } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { describe, it, expect, vi } from 'vitest';

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/shared/logger/logger', () => ({ createLogger: () => log }));
// Traced only where a test switches it on
const telemetry = vi.hoisted(() => ({ on: false }));
vi.mock('@/features/telemetry/telemetry.config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/telemetry/telemetry.config')>()),
  isTelemetryEnabled: () => telemetry.on,
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
import { CancelledRequestError } from '@/features/ai-service/adapters/types';
import type { ChatOptions, ChatResult } from '@/features/ai-service/ai-service.types';
import { ATTR } from '@/features/telemetry/attribute-keys';

const exporter = new InMemorySpanExporter();
trace.setGlobalTracerProvider(new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }));

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
      discardEmptySession: vi.fn().mockResolvedValue(undefined),
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

  describe('model choice', () => {
    it("uses the experience's model for every AI call in the turn, the answer included", async () => {
      const deps = makeDeps();

      await runV2Pipeline(makeInput(), deps);

      const chat = deps.synthesis.chat as ReturnType<typeof vi.fn>;
      const features = chat.mock.calls.map(([, options]) => options?.feature);
      expect(features).toEqual(['turn-planner', 'param-extraction', 'response-synthesis']);
      for (const [, options] of chat.mock.calls) {
        expect(options).toMatchObject({ providerId: 'p1', modelId: 1 });
      }
    });

    it.each([
      ['a greeting', { directResponse: true, needsClarification: false, clarificationQuestion: null }],
      ['a clarifying question', { directResponse: false, needsClarification: true, clarificationQuestion: 'Which size?' }],
    ])("uses the experience's model when the answer is %s", async (_, planAnswer) => {
      const chatMock = vi.fn()
        .mockResolvedValueOnce(makeChatResult(JSON.stringify({ actions: [], reasoning: 'no tools needed', confidence: 0.9, ...planAnswer })))
        .mockResolvedValueOnce(makeChatResult('Hello!'));
      const deps = makeDeps();
      deps.turnPlanner = { chat: chatMock };
      deps.synthesis = { chat: chatMock };

      await runV2Pipeline(makeInput({ message: 'Hello!' }), deps);

      const features = chatMock.mock.calls.map(([, options]) => options?.feature);
      expect(features).toEqual(['turn-planner', 'response-synthesis']);
      for (const [, options] of chatMock.mock.calls) {
        expect(options).toMatchObject({ providerId: 'p1', modelId: 1 });
      }
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
    it('fails the turn with the error as its cause, marks the step failed, sends no error text of its own, and stops its timer', async () => {
      const deps = makeDeps();
      const down = new Error('connect ECONNREFUSED 10.0.0.5:5432');
      deps.contextAssembly.sessionLoader.getSessionWithWindow = vi.fn().mockRejectedValue(down);
      deps.contextAssembly.sessionLoader.createSession = vi.fn().mockRejectedValue(down);
      const input = makeInput({ sessionId: '' });

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const thrown = await runV2Pipeline(input, deps).catch((e: unknown) => e);

        // The answer to the caller (chatEventStream) explains and logs it
        expect((thrown as Error).cause).toBe(down);
        // The turn's wall-clock timer isn't left running
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
      const events = (input.onEvent as ReturnType<typeof vi.fn>).mock.calls.map(([e]: [PipelineStreamEvent]) => e);
      expect(events.some((e: PipelineStreamEvent) => e.type === 'error')).toBe(false);
      expect(events).toContainEqual(expect.objectContaining({ type: 'step_complete', stepId: 'context-assembly', status: 'error' }));
    });
  });

  describe('a turn that runs out of time', () => {
    it("stops: no model call, search or save after the timeout, recorded as timed out and not logged as failing", async () => {
      const deps = makeDeps();
      // A new conversation: the session is created by this turn
      deps.contextAssembly.sessionLoader.getSessionWithWindow = vi.fn().mockResolvedValue(null);
      deps.contextAssembly.sessionLoader.createSession = vi.fn().mockResolvedValue({
        session: { id: 'session-new', summary: null, facts: null, pipelineState: null, userContext: null, messageCount: 0, status: 'active' },
        messages: [],
      });
      // The planner answers late, unless its request is aborted first
      const chat = deps.turnPlanner.chat as ReturnType<typeof vi.fn>;
      let answerLate = () => {};
      chat.mockReset();
      chat.mockImplementationOnce((_messages: unknown, options?: ChatOptions) => new Promise((resolve, reject) => {
        answerLate = () => resolve(makeChatResult(JSON.stringify({
          actions: [{ toolSlug: 'product-search', intent: 'Search for red shoes', hints: '{"query":"red shoes"}', dependsOnPrevious: false }],
          reasoning: 'User wants to search', directResponse: false, needsClarification: false, clarificationQuestion: null, confidence: 0.95,
        })));
        options?.signal?.addEventListener('abort', () => reject(new CancelledRequestError('openai')));
      }))
        .mockResolvedValueOnce(makeChatResult(JSON.stringify({ query: 'red shoes' })))
        .mockResolvedValueOnce(makeChatResult('I found some red shoes for you!'));
      const input = makeInput({ sessionId: '' });

      vi.clearAllMocks();
      telemetry.on = true;
      exporter.reset();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const result = runV2Pipeline(input, deps, { maxTotalDurationMs: 1000 });
        await vi.waitFor(() => expect(chat).toHaveBeenCalledOnce());
        await vi.advanceTimersByTimeAsync(1000);
        await expect(result).resolves.toMatchObject({ responseText: '' });
        answerLate();
        await vi.waitFor(() => expect(exporter.getFinishedSpans().map((s) => s.name)).toContain('pipeline.v2.turn'));
      } finally {
        vi.useRealTimers();
        telemetry.on = false;
      }

      expect(chat).toHaveBeenCalledOnce();
      expect(deps.executionLoop.executeTool).not.toHaveBeenCalled();
      expect(deps.persistence.addMessages).not.toHaveBeenCalled();
      expect(deps.persistence.discardEmptySession).toHaveBeenCalledWith('session-new');
      const turn = exporter.getFinishedSpans().find((s) => s.name === 'pipeline.v2.turn')!;
      // A failed turn in the analytics, not one the visitor left (abandonedTurn needs no outcome)
      expect(turn.attributes['alpha.v2.outcome']).toBe('timed_out');
      expect(turn.attributes[ATTR.TURN_ABANDONED]).toBe('the turn-planner call finished');
      expect(log.warn).toHaveBeenCalledWith('V2 pipeline timed out — returning graceful response', expect.anything());
      expect(log.error).not.toHaveBeenCalled();
    });
  });
});
