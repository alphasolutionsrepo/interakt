// src/features/pipeline/chat-event-stream.test.ts

/**
 * A turn that runs on after its stream closed (it timed out, and the answer was sent)
 * drops its late events rather than failing to send them, which its steps would log as
 * the turn failing.
 */

import { describe, expect, it, vi } from 'vitest';

import { chatEventStream } from './chat-event-stream';
import type { ChatPipelineInput } from './chat-pipeline';
import type { PipelineStreamEvent } from './pipeline.types';

const pipeline = vi.hoisted(() => ({ onEvent: undefined as ((event: PipelineStreamEvent) => void) | undefined }));
vi.mock('./chat-pipeline', () => ({
  runChatPipeline: vi.fn(async (input: ChatPipelineInput) => {
    pipeline.onEvent = input.onEvent;
    input.onEvent({ type: 'error', message: 'Pipeline execution timed out' });
    input.onEvent({ type: 'done', sessionId: 'session-1' });
  }),
}));
vi.mock('@/features/telemetry', () => ({ flushTelemetry: vi.fn(async () => {}) }));

describe('a turn that runs on after its stream closed', () => {
  it('drops its late events instead of failing to send them', async () => {
    const response = chatEventStream({ experience: { id: 'exp-1' } } as unknown as Omit<ChatPipelineInput, 'onEvent'>);
    const text = await response.text();
    expect(text).toContain('Pipeline execution timed out');

    // The timed-out work answers later
    expect(() => pipeline.onEvent!({ type: 'step_complete', stepId: 'citations', stepType: 'citation_formatter', durationMs: 1, status: 'ok' })).not.toThrow();
  });
});
