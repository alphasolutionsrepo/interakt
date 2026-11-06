// src/shared/api/stream-events.test.ts

import { describe, expect, it } from 'vitest';

import { streamEvents } from './stream-events';

/** A response whose body arrives in the given pieces */
function chunked(...pieces: string[]) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({ start(c) { pieces.forEach((p) => c.enqueue(encoder.encode(p))); c.close(); } }));
}

async function all(response: Response) {
  const events: unknown[] = [];
  for await (const event of streamEvents(response)) events.push(event);
  return events;
}

describe('streamEvents', () => {
  it('parses each event, however the body is split', async () => {
    expect(await all(chunked('data: {"type":"con', 'tent","text":"a"}\n\ndata: {"type":"done"}\n\n'))).toEqual([{ type: 'content', text: 'a' }, { type: 'done' }]);
  });

  it('skips lines that are not data, or not JSON', async () => {
    expect(await all(chunked(': ping\n\ndata: {oops\n\ndata: {"type":"done"}\n\n'))).toEqual([{ type: 'done' }]);
  });

  it('keeps a last event the server sent without a closing newline', async () => {
    expect(await all(chunked('data: {"type":"error","message":"x"}'))).toEqual([{ type: 'error', message: 'x' }]);
  });
});

describe('streamEvents at the end of the stream', () => {
  it('stops at the [DONE] marker', async () => {
    expect(await all(chunked('data: {"type":"content"}\n\ndata: [DONE]\n\ndata: {"type":"late"}\n\n'))).toEqual([{ type: 'content' }]);
  });

  it('lets the body go when the reader stops early', async () => {
    const response = chunked('data: {"n":1}\n\ndata: {"n":2}\n\n');
    for await (const _event of streamEvents(response)) break;
    expect(response.body!.locked).toBe(false);
  });
});
