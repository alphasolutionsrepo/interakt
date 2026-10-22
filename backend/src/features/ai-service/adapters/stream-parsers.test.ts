// src/features/ai-service/adapters/stream-parsers.test.ts

/**
 * Provider streams are read through one reader. A caller that stops early (a
 * cancelled summary) closes the response, so the provider stops generating
 * instead of writing tokens nobody reads.
 */

import { describe, expect, it, vi } from 'vitest';

import { parseNDJSONStream, parseSSEStream } from './types';

/** A response whose body yields the given text chunks and records a cancel. */
function streamingResponse(chunks: string[]) {
  const cancel = vi.fn();
  const encoder = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(encoder.encode(chunks[i++]));
      else controller.close();
    },
    cancel,
  });
  return { response: new Response(body), cancel };
}

async function collect(gen: AsyncGenerator<string>) {
  const out: string[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe('parseNDJSONStream', () => {
  it('yields one line per JSON object, across chunk boundaries', async () => {
    const { response, cancel } = streamingResponse(['{"a":1}\n{"b"', ':2}\n', '{"c":3}']);
    expect(await collect(parseNDJSONStream(response, 'ollama'))).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('closes the response when the caller stops early', async () => {
    const { response, cancel } = streamingResponse(['{"a":1}\n', '{"b":2}\n', '{"c":3}\n']);
    for await (const line of parseNDJSONStream(response, 'ollama')) {
      expect(line).toBe('{"a":1}');
      break;
    }
    expect(cancel).toHaveBeenCalledOnce();
  });
});

describe('parseSSEStream', () => {
  it('yields event data, skipping [DONE]', async () => {
    const { response, cancel } = streamingResponse(['data: {"a":1}\n\ndata: {"b"', ':2}\n\ndata: [DONE]\n\n']);
    expect(await collect(parseSSEStream(response, 'openai'))).toEqual(['{"a":1}', '{"b":2}']);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('closes the response when the caller stops early', async () => {
    const { response, cancel } = streamingResponse(['data: {"a":1}\n\n', 'data: {"b":2}\n\n']);
    for await (const data of parseSSEStream(response, 'openai')) {
      expect(data).toBe('{"a":1}');
      break;
    }
    expect(cancel).toHaveBeenCalledOnce();
  });
});
