// src/features/analytics/pipeline/analytics-pipeline-orchestrator.failure.test.ts

/**
 * An analytics chat turn that fails tells the asker and logs the error itself, with its
 * causes: the steps below pass failures of the AI service on without logging them. The
 * asker gets the shared error body (a request id, no error text of ours); a refusal
 * keeps its own message.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError } from '@/shared/errors/app-error';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('server-only', () => ({}));
vi.mock('@/features/ai-service/ai-service.service', () => ({ chat: vi.fn(), streamChat: vi.fn() }));
const modelDown = vi.hoisted(() => new Error('model "qwen2.5:14b" not found', { cause: new Error('404 from Ollama') }));
const steps = vi.hoisted(() => ({ assemble: vi.fn() }));
vi.mock('./analytics-context-assembly', () => ({ assembleAnalyticsContext: steps.assemble }));
vi.mock('./analytics-turn-planner', () => ({
  planAnalyticsTurn: vi.fn(async () => ({ success: true, data: { actions: [], directResponse: true, reasoning: 'No tools needed' }, summary: '', durationMs: 0 })),
}));
vi.mock('./analytics-execution', () => ({ executeAnalyticsTools: vi.fn(async () => ({ success: true, data: [], summary: '', durationMs: 0 })) }));
vi.mock('./analytics-synthesis', () => ({
  synthesizeAnalyticsResponse: vi.fn(async () => ({ success: false, summary: 'Synthesis failed: model not found', durationMs: 0, error: modelDown })),
}));
vi.mock('./analytics-grounding', () => ({ findUnsupportedFigures: vi.fn() }));
vi.mock('./analytics-persistence', () => ({ persistAnalyticsTurn: vi.fn() }));

import { runAnalyticsPipeline } from './analytics-pipeline-orchestrator';

describe('an analytics chat turn that fails', () => {
  beforeEach(() => {
    logs.length = 0;
    steps.assemble.mockResolvedValue({ success: true, data: { userMessage: 'How many searches today?', history: [] }, summary: '', durationMs: 0 });
  });

  it('logs a failed answer once, with the model error as its cause', async () => {
    const emit = vi.fn();
    await runAnalyticsPipeline({ message: 'How many searches today?', sessionId: 's1' } as never, emit);

    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ err: expect.objectContaining({ cause: modelDown }) }) }),
    ]);
  });

  it('tells the asker without the error text, with a request id, and logs the error once', async () => {
    steps.assemble.mockRejectedValue(modelDown);
    const emit = vi.fn();
    await runAnalyticsPipeline({ message: 'How many searches today?', sessionId: 's1' } as never, emit);

    const event = emit.mock.calls.map(([e]) => e).find((e) => e.type === 'error');
    expect(event).toMatchObject({ code: 'INTERNAL_ERROR', requestId: expect.any(String) });
    expect(event.error).toBe(event.message);
    expect(JSON.stringify(event)).not.toContain('qwen2.5');
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId: event.requestId, operation: 'analyticsChatTurn', err: modelDown }) }),
    ]);
  });

  it('tells the asker a refusal in its own words, logged once as a warning', async () => {
    const summary = 'This conversation is about "Catalog". Start a new conversation to ask about a different experience.';
    steps.assemble.mockResolvedValue({ success: false, summary, error: new ConflictError(summary), durationMs: 0 });
    const emit = vi.fn();
    await runAnalyticsPipeline({ message: 'and yesterday?', sessionId: 's1' } as never, emit);

    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', error: summary, message: summary, code: 'CONFLICT' }));
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ operation: 'analyticsChatTurn' }) })]);
  });
});
