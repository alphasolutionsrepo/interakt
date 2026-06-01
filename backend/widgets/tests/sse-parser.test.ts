/**
 * SSE parser tests for the chat streaming reader.
 *
 * Exercises the parser against fragmented event streams (a single logical
 * `data:` event split across multiple TextDecoder chunks) and the `[DONE]`
 * sentinel used by the backend's chat route.
 */
import { describe, it, expect } from 'vitest';
import { streamChat } from '../src/shared/api-client';

/**
 * Build a mock `Response` whose body streams the provided byte chunks
 * sequentially. Each chunk becomes one ReadableStream read cycle.
 */
function makeMockResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('streamChat SSE parser', () => {
  it('emits events split across arbitrary chunk boundaries', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      makeMockResponse([
        'data: {"type":"content","te',
        'xt":"Hello "}\n\n',
        'data: {"type":"content","text":"world"}\n\n',
        'data: [DONE]\n\n',
      ]);

    try {
      const events: unknown[] = [];
      for await (const e of streamChat({
        apiBaseUrl: 'http://example.test',
        accessToken: 'tok',
        message: 'hi',
      })) {
        events.push(e);
      }
      expect(events).toEqual([
        { type: 'content', text: 'Hello ' },
        { type: 'content', text: 'world' },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('stops cleanly at the [DONE] sentinel and ignores malformed events', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      makeMockResponse([
        'data: {invalid json}\n\n',
        'data: {"type":"done","sessionId":"s1"}\n\n',
        'data: [DONE]\n\n',
        'data: {"type":"content","text":"ignored"}\n\n',
      ]);

    try {
      const events: unknown[] = [];
      for await (const e of streamChat({
        apiBaseUrl: 'http://example.test',
        accessToken: 'tok',
        message: 'hi',
      })) {
        events.push(e);
      }
      expect(events).toEqual([{ type: 'done', sessionId: 's1' }]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws ApiError with server message when response is non-OK', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });

    try {
      await expect(async () => {
        for await (const _e of streamChat({
          apiBaseUrl: 'http://example.test',
          accessToken: 'tok',
          message: 'hi',
        })) {
          // drain
        }
      }).rejects.toThrow(/Origin not allowed/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
