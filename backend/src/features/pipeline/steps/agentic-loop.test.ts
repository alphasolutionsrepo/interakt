// src/features/pipeline/steps/agentic-loop.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Span } from '@opentelemetry/api';

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));

vi.mock('@/features/telemetry', () => ({
  shouldLogContent: () => false,
}));

const streamChat = vi.fn();
vi.mock('@/features/ai-service/ai-service.service', () => ({
  streamChat: (...args: unknown[]) => streamChat(...args),
}));

const executeTool = vi.fn();
vi.mock('@/features/tools/tools.executor', () => ({
  executeTool: (...args: unknown[]) => executeTool(...args),
}));

const applyToolResultToMemory = vi.fn();
vi.mock('./result-memory', () => ({
  applyToolResultToMemory: (...args: unknown[]) => applyToolResultToMemory(...args),
}));

import { agenticLoopHandler } from './agentic-loop';
import type { PipelineContext } from '../pipeline.types';

// ============================================================================
// FIXTURES
// ============================================================================

function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    experienceId: 'exp-1',
    experienceSlug: 'test-exp',
    userMessage: 'hello',
    sessionId: 'sess-1',
    conversationHistory: [],
    resultMemory: { sets: {}, referenceIndex: [] },
    stepResults: {},
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    emitEvent: vi.fn(),
    responseText: '',
    responseMetadata: {},
    aborted: false,
    shared: {},
    ...overrides,
  };
}

function makeSpan(): Span {
  return {
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    addEvent: vi.fn(),
    setStatus: vi.fn(),
    recordException: vi.fn(),
    updateName: vi.fn(),
    end: vi.fn(),
    isRecording: () => true,
    spanContext: () => ({ traceId: 't', spanId: 's', traceFlags: 0 }),
  } as unknown as Span;
}

// streamChat is consumed via `for await (const chunk of streamChat(...))`.
// Make it return an async generator that yields the requested chunks.
function mockStreamReturning(chunks: Array<Record<string, unknown>>) {
  streamChat.mockImplementationOnce(() => (async function* () {
    for (const c of chunks) yield c;
  })());
}

// ============================================================================
// TESTS
// ============================================================================

describe('agenticLoopHandler', () => {
  beforeEach(() => {
    streamChat.mockReset();
    executeTool.mockReset();
    applyToolResultToMemory.mockReset();
  });

  it('happy path: returns text directly when the model emits no tool calls', async () => {
    mockStreamReturning([
      { content: 'Hello!' },
      { done: true, usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 } },
    ]);

    const ctx = makeCtx();
    const result = await agenticLoopHandler.execute({}, ctx, makeSpan());

    expect(result.success).toBe(true);
    expect(ctx.responseText).toBe('Hello!');
    expect(ctx.tokenUsage.totalTokens).toBe(12);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('tool flow: executes the tool the model requested, then loops for the final text', async () => {
    // Iteration 1 — model decides to call a tool
    mockStreamReturning([
      { toolCalls: [{ id: 'call-1', name: 'search', input: { q: 'hats' } }] },
      { done: true, usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } },
    ]);
    // Iteration 2 — model produces the final answer
    mockStreamReturning([
      { content: 'Found 3 hats.' },
      { done: true, usage: { inputTokens: 20, outputTokens: 5, totalTokens: 25 } },
    ]);

    executeTool.mockResolvedValueOnce({
      success: true,
      data: { results: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
      durationMs: 42,
    });

    const ctx = makeCtx();
    const result = await agenticLoopHandler.execute(
      { toolNameToId: { search: 'tool-search-id' } },
      ctx,
      makeSpan(),
    );

    expect(result.success).toBe(true);
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledWith('tool-search-id', { q: 'hats' });
    expect(applyToolResultToMemory).toHaveBeenCalledTimes(1);
    expect(ctx.responseText).toBe('Found 3 hats.');
    expect(ctx.tokenUsage.totalTokens).toBe(33);
  });

  it('parallel tools: applies memory in tool-call order regardless of resolution order', async () => {
    // Iteration 1 — two tool calls; iteration 2 — final text
    mockStreamReturning([
      {
        toolCalls: [
          { id: 'call-a', name: 'search', input: { q: 'red' } },
          { id: 'call-b', name: 'search', input: { q: 'blue' } },
        ],
      },
      { done: true, usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } },
    ]);
    mockStreamReturning([
      { content: 'Done.' },
      { done: true, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
    ]);

    // B resolves before A in wall-clock terms — order invariant is that
    // memory is applied in tool-call order, not resolution order.
    executeTool.mockImplementationOnce(() =>
      new Promise((r) => setTimeout(() => r({
        success: true, data: { results: [{ id: 'A' }] }, durationMs: 20,
      }), 20)),
    );
    executeTool.mockResolvedValueOnce({
      success: true,
      data: { results: [{ id: 'B' }] },
      durationMs: 1,
    });

    const ctx = makeCtx();
    await agenticLoopHandler.execute(
      { toolNameToId: { search: 'tool-search-id' } },
      ctx,
      makeSpan(),
    );

    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(applyToolResultToMemory).toHaveBeenCalledTimes(2);
    expect(applyToolResultToMemory.mock.calls[0][1]).toEqual({ results: [{ id: 'A' }] });
    expect(applyToolResultToMemory.mock.calls[1][1]).toEqual({ results: [{ id: 'B' }] });
  });

  it('tool failure: continues the loop with the error fed back to the model', async () => {
    mockStreamReturning([
      { toolCalls: [{ id: 'call-1', name: 'flaky', input: {} }] },
      { done: true, usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } },
    ]);
    mockStreamReturning([
      { content: "Sorry — couldn't search." },
      { done: true, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
    ]);

    executeTool.mockResolvedValueOnce({
      success: false,
      error: 'upstream timeout',
      durationMs: 30000,
    });

    const ctx = makeCtx();
    const result = await agenticLoopHandler.execute(
      { toolNameToId: { flaky: 'tool-flaky-id' } },
      ctx,
      makeSpan(),
    );

    expect(result.success).toBe(true);
    // Memory must not be updated on failure.
    expect(applyToolResultToMemory).not.toHaveBeenCalled();
    expect(ctx.responseText).toBe("Sorry — couldn't search.");
  });

  it('unknown tool: emits an error tool_result without crashing the loop', async () => {
    mockStreamReturning([
      { toolCalls: [{ id: 'call-1', name: 'mystery', input: {} }] },
      { done: true, usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } },
    ]);
    mockStreamReturning([
      { content: 'No such tool.' },
      { done: true, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
    ]);

    const ctx = makeCtx();
    // toolNameToId omits 'mystery' — should be reported as unknown
    const result = await agenticLoopHandler.execute(
      { toolNameToId: {} },
      ctx,
      makeSpan(),
    );

    expect(result.success).toBe(true);
    expect(executeTool).not.toHaveBeenCalled();
    expect(ctx.responseText).toBe('No such tool.');
  });
});

describe('agenticLoopHandler.fallback', () => {
  it('translates a TPM error into a user-visible message', async () => {
    const ctx = makeCtx();
    const emit = ctx.emitEvent as ReturnType<typeof vi.fn>;
    const err = new Error('Request too large for gpt-4o on tokens per min (TPM): Limit 30000');

    const result = await agenticLoopHandler.fallback!({}, ctx, err);

    expect(result.success).toBe(false);
    expect(ctx.responseText).toMatch(/per-minute token limit/i);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'content' }));
  });

  it('falls back to the generic apology on unknown errors', async () => {
    const ctx = makeCtx();
    const err = new Error('Something exploded');

    await agenticLoopHandler.fallback!({}, ctx, err);

    expect(ctx.responseText).toMatch(/encountered an issue/i);
  });
});
