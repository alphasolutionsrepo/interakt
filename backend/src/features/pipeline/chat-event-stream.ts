// src/features/pipeline/chat-event-stream.ts

/**
 * A chat turn as a server-sent event stream, shared by the public chat routes (by token
 * and by slug). A turn that fails after the stream started sends an error event with the
 * same body an error response has: a plain message for visitors, the explanation for an
 * admin testing the experience, and the request id. It is logged once.
 */

import { runChatPipeline, type ChatPipelineInput } from './chat-pipeline';
import type { PipelineStreamEvent } from './pipeline.types';

import { flushTelemetry } from '@/features/telemetry';
import { describeError } from '@/shared/api/response';

export function chatEventStream(input: Omit<ChatPipelineInput, 'onEvent'>): Response {
  const encoder = new TextEncoder();
  const sseEvent = (event: PipelineStreamEvent) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

  // Closed by the visitor, or by us once the turn answered (a timed-out turn runs on).
  // The turn finishes unseen: its events are dropped rather than failing to send, which
  // the steps would log as errors.
  let open = true;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runChatPipeline({ ...input, onEvent: (event) => { if (open) controller.enqueue(sseEvent(event)); } });
      } catch (err) {
        // Logged even when the visitor has gone: it failed all the same
        const { body } = describeError(err, 500, { operation: 'chatTurn', experienceId: input.experience.id });
        if (open) controller.enqueue(sseEvent({ type: 'error', message: body.message, code: body.code, ...(body.hint && { hint: body.hint }), requestId: body.requestId }));
      } finally {
        // Flush telemetry spans before closing — in serverless environments (Vercel)
        // the runtime freezes after the response, so the BatchSpanProcessor's background
        // timer never fires and spans are lost without an explicit flush.
        await flushTelemetry();
        if (open) {
          open = false;
          controller.close();
        }
      }
    },
    cancel() {
      open = false;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering for SSE
    },
  });
}
