// src/features/pipeline/chat-event-stream.test.ts
//
// A visitor who closes the chat mid-answer. The real stream, pipeline and orchestrator
// run with tracing on; the model, tools and sessions are faked, as in chat-pipeline.test.ts.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';


const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  executeTool: vi.fn(),
  addMessages: vi.fn(),
  updateSession: vi.fn(),
  flushTelemetry: vi.fn(),
}));

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/features/prompt-templates', () => ({
  resolveTemplate: vi.fn().mockResolvedValue(null),
  renderTemplate: vi.fn((content: string) => content),
}));
vi.mock('@/features/telemetry/telemetry.config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/telemetry/telemetry.config')>()),
  isTelemetryEnabled: () => true,
}));
// Called once the turn is over, whichever way it ended
vi.mock('@/features/telemetry/telemetry.init', () => ({ flushTelemetry: mocks.flushTelemetry }));
vi.mock('@/features/search/search.service', () => ({
  withExperienceContext: (_experienceId: string, fn: () => unknown) => fn(),
}));
vi.mock('@/features/ai-service/ai-service.service', () => ({ chat: mocks.chat }));
vi.mock('@/features/tools/tools.executor', () => ({ executeTool: mocks.executeTool }));
vi.mock('@/features/analytics', () => ({ trackToolExecution: vi.fn() }));
vi.mock('@/features/data-source/data-source.service', () => ({ getDataSourceById: vi.fn().mockResolvedValue(null) }));
vi.mock('@/features/sessions/sessions.service', () => ({
  getSessionWithWindow: vi.fn().mockResolvedValue(null),
  createSession: vi.fn().mockResolvedValue({ id: 'session-1' }),
  addMessages: mocks.addMessages,
  updateSession: mocks.updateSession,
  shouldSummarize: vi.fn().mockReturnValue(false),
}));

import { chatEventStream } from './chat-event-stream';

import type { AIExperienceWithTools } from '@/features/ai-experience/ai-experience.types';
import type { ChatResult } from '@/features/ai-service/ai-service.types';
import { ATTR } from '@/features/telemetry/attribute-keys';
import type { LogLine } from '@/shared/test/log-recorder';

const exporter = new InMemorySpanExporter();
trace.setGlobalTracerProvider(new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }));

// ============================================================================
// FIXTURES
// ============================================================================

function makeExperience(pipelineMode: 'deterministic' | 'agentic' = 'deterministic'): AIExperienceWithTools {
  return {
    id: 'exp-1',
    slug: 'test-exp',
    providerId: 'p1',
    modelId: 1,
    pipelineMode,
    executionPolicy: null,
    guardrailConfig: null,
    personaConfig: {
      systemInstructions: 'Be helpful.',
      businessDomains: ['E-commerce'],
      tone: 'friendly',
      name: 'TestBot',
      responseFormats: { enabledPresets: ['rich_text', 'item_grid'], defaultPreset: 'rich_text' },
    },
    sessionConfig: { maxContextMessages: 6 },
    mcpConnections: [],
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
  } as unknown as AIExperienceWithTools;
}

function chatResult(content: string): ChatResult {
  return {
    message: { role: 'assistant', content },
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    finishReason: 'stop',
    metadata: { requestId: 'r1', providerId: 'p1', providerKey: 'openai', modelId: 1, modelKey: 'gpt-4o', durationMs: 200 },
  };
}

const search = (query: string) => ({ toolSlug: 'product-search', intent: `Search for ${query}`, hints: JSON.stringify({ query }), dependsOnPrevious: false });

/** The planner's reply: search for each query, in order */
function plan(...queries: string[]) {
  return chatResult(JSON.stringify({
    actions: queries.map(search),
    reasoning: 'User wants to search',
    directResponse: false,
    needsClarification: false,
    clarificationQuestion: null,
    confidence: 0.95,
  }));
}

/** Replies to every model call by its step; `during` runs inside the named step's first call */
function scriptModel(replies: { planner: ChatResult[] }, during?: { step: string; then: () => Promise<void> }) {
  let hooked = false;
  mocks.chat.mockImplementation(async (_messages: unknown, options?: { feature?: string }) => {
    if (during && !hooked && options?.feature === during.step) {
      hooked = true;
      await during.then();
    }
    if (options?.feature === 'turn-planner') return replies.planner.shift() ?? plan('red shoes');
    if (options?.feature === 'param-extraction') return chatResult(JSON.stringify({ query: 'red shoes' }));
    return chatResult('I found some red shoes for you!');
  });
}

// The fake data source has no schema, which is warned about on every search: not what these tests are about
const errors = () => logs.filter((l) => l.level === 'error');
const steps = () => mocks.chat.mock.calls.map(([, options]) => options?.feature);
const span = (name: string) => exporter.getFinishedSpans().find((s) => s.name === name);

/** Starts a turn; `leave()` is the visitor closing the chat, `over` settles when the turn has ended */
function startTurn(experience = makeExperience()) {
  const over = new Promise<void>((resolve) => mocks.flushTelemetry.mockImplementationOnce(async () => resolve()));
  const res = chatEventStream({ experience, message: 'Search for red shoes', sessionId: 'session-1' });
  const reader = res.body!.getReader();
  return { reader, over, leave: () => reader.cancel() };
}

/** Timers left running once the span exporter's own callbacks have run: the turn's wall-clock timer, if not cleared */
async function timersLeft() {
  await vi.advanceTimersByTimeAsync(0);
  return vi.getTimerCount();
}

const stopped = (step: string) => ({ level: 'info', service: 'chat-event-stream', message: 'Visitor left; chat turn stopped', context: { experienceId: 'exp-1', requestId: expect.any(String), step } });

// ============================================================================
// TESTS
// ============================================================================

describe('chatEventStream when the visitor closes the chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chat.mockReset();
    mocks.executeTool.mockReset();
    mocks.addMessages.mockResolvedValue(undefined);
    mocks.updateSession.mockResolvedValue(undefined);
    mocks.flushTelemetry.mockResolvedValue(undefined);
    logs.length = 0;
    exporter.reset();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops after the planner call it left during: no tool call, no answer, nothing saved, one info line', async () => {
    mocks.executeTool.mockResolvedValue({ success: true, data: [{ id: 'p1', title: 'Red Shoes' }], resultCount: 1 });
    const turn = startTurn();
    scriptModel({ planner: [plan('red shoes')] }, { step: 'turn-planner', then: turn.leave });

    await turn.over;

    expect(steps()).toEqual(['turn-planner']);
    expect(mocks.executeTool).not.toHaveBeenCalled();
    expect(mocks.addMessages).not.toHaveBeenCalled();
    expect(mocks.updateSession).not.toHaveBeenCalled();
    expect(logs.filter((l) => l.service === 'chat-event-stream')).toEqual([stopped('calling product-search')]);
    expect(errors()).toEqual([]);
    // The turn's wall-clock timer isn't left running
    expect(await timersLeft()).toBe(0);
  });

  it("isn't traced as a failed turn: the spans say where it stopped instead", async () => {
    const turn = startTurn();
    scriptModel({ planner: [plan('red shoes')] }, { step: 'turn-planner', then: turn.leave });

    await turn.over;

    for (const name of ['chat.ai_experience.turn', 'pipeline.v2.turn']) {
      expect(span(name)?.status.code).toBe(SpanStatusCode.UNSET);
      expect(span(name)?.attributes[ATTR.TURN_ABANDONED]).toBe('calling product-search');
      expect(span(name)?.events.map((e) => e.name)).not.toContain('exception');
    }
    expect(exporter.getFinishedSpans().filter((s) => s.status.code === SpanStatusCode.ERROR)).toEqual([]);
  });

  it('finishes the tool call it left during, then runs no further action and writes no answer', async () => {
    const turn = startTurn();
    scriptModel({ planner: [plan('red shoes', 'blue shoes')] });
    mocks.executeTool.mockImplementationOnce(async () => {
      await turn.leave();
      return { success: true, data: [{ id: 'p1', title: 'Red Shoes' }], resultCount: 1 };
    });

    await turn.over;

    expect(mocks.executeTool).toHaveBeenCalledOnce();
    expect(steps()).toEqual(['turn-planner', 'param-extraction']);
    expect(mocks.addMessages).not.toHaveBeenCalled();
    expect(logs.filter((l) => l.service === 'chat-event-stream')).toEqual([stopped('calling product-search')]);
    expect(errors()).toEqual([]);
    expect(await timersLeft()).toBe(0);
  });

  it("doesn't plan again when a round came back empty after the visitor left", async () => {
    // The agentic preset re-plans after a round with nothing to answer from
    const turn = startTurn(makeExperience('agentic'));
    scriptModel({ planner: [plan('red shoes'), plan('shoes')] });
    mocks.executeTool.mockImplementationOnce(async () => {
      await turn.leave();
      return { success: true, data: { results: [], totalCount: 0 }, resultCount: 0 };
    }).mockResolvedValue({ success: true, data: { results: [], totalCount: 0 }, resultCount: 0 });

    await turn.over;

    expect(steps().filter((s) => s === 'turn-planner')).toHaveLength(1);
    expect(steps()).not.toContain('response-synthesis');
    expect(mocks.addMessages).not.toHaveBeenCalled();
    expect(logs.filter((l) => l.service === 'chat-event-stream')).toEqual([stopped('planning round 2')]);
    expect(errors()).toEqual([]);
  });

  it('stops before the answer when the plan needs no tool', async () => {
    const turn = startTurn();
    const greeting = chatResult(JSON.stringify({ actions: [], reasoning: 'greeting', directResponse: true, needsClarification: false, clarificationQuestion: null, confidence: 0.99 }));
    scriptModel({ planner: [greeting] }, { step: 'turn-planner', then: turn.leave });

    await turn.over;

    expect(steps()).toEqual(['turn-planner']);
    expect(mocks.addMessages).not.toHaveBeenCalled();
    expect(logs.filter((l) => l.service === 'chat-event-stream')).toEqual([stopped('writing the answer')]);
  });

  it("doesn't save the answer when the visitor left while it was being written", async () => {
    mocks.executeTool.mockResolvedValue({ success: true, data: [{ id: 'p1', title: 'Red Shoes' }], resultCount: 1 });
    const turn = startTurn();
    scriptModel({ planner: [plan('red shoes')] }, { step: 'response-synthesis', then: turn.leave });

    await turn.over;

    expect(steps()).toEqual(['turn-planner', 'param-extraction', 'response-synthesis']);
    expect(mocks.addMessages).not.toHaveBeenCalled();
    expect(mocks.updateSession).not.toHaveBeenCalled();
    expect(logs.filter((l) => l.service === 'chat-event-stream')).toEqual([stopped('saving the turn')]);
    expect(errors()).toEqual([]);
  });

  it('still logs a planner call that fails after the visitor left, once, and saves nothing', async () => {
    const turn = startTurn();
    const down = new Error('connect ECONNREFUSED 127.0.0.1:11434');
    mocks.chat.mockImplementationOnce(async () => {
      await turn.leave();
      throw down;
    });

    await turn.over;

    expect(errors()).toEqual([expect.objectContaining({ level: 'error', message: 'Turn planning failed', context: expect.objectContaining({ err: down }) })]);
    expect(mocks.addMessages).not.toHaveBeenCalled();
    expect(logs.filter((l) => l.service === 'chat-event-stream')).toEqual([stopped('saving the turn')]);
  });

  it('runs and saves a turn the visitor stays for, as before', async () => {
    mocks.executeTool.mockResolvedValue({ success: true, data: [{ id: 'p1', title: 'Red Shoes' }], resultCount: 1 });
    scriptModel({ planner: [plan('red shoes')] });
    const turn = startTurn();

    let text = '';
    const decoder = new TextDecoder();
    for (let chunk = await turn.reader.read(); !chunk.done; chunk = await turn.reader.read()) text += decoder.decode(chunk.value);
    await turn.over;

    expect(text).toContain('"type":"done"');
    expect(steps()).toEqual(['turn-planner', 'param-extraction', 'response-synthesis']);
    expect(mocks.addMessages).toHaveBeenCalledOnce();
    expect(mocks.addMessages.mock.calls[0][1].map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    expect(logs.filter((l) => l.service === 'chat-event-stream')).toEqual([]);
    expect(span('chat.ai_experience.turn')?.status.code).toBe(SpanStatusCode.OK);
    expect(await timersLeft()).toBe(0);
  });
});
