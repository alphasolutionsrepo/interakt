// src/app/playground/unified-search/_lib/read-summary-stream.test.ts

/**
 * The playground's Generate summary reads the stream here. A failure, before the stream
 * or as its error event, keeps the hint and request id the server sent: the error event
 * below is the one the server builds (describeError).
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger([]));

import { describeError } from '@/shared/api/response';
import { AppError } from '@/shared/errors/app-error';

import { readSummaryStream } from './read-summary-stream';

const stream = (...events: unknown[]) =>
  new Response(events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });

const rejected = new AppError('OpenAI rejected the credentials.', { code: 'UPSTREAM_AUTH', status: 502, hint: 'Check the API key.' });

describe('readSummaryStream', () => {
  it('passes on the text as it arrives', async () => {
    const text: string[] = [];
    await readSummaryStream(stream({ type: 'content', text: 'Linen ' }, { type: 'content', text: 'shirts' }, '[DONE]'), (t) => text.push(t));
    expect(text.join('')).toBe('Linen shirts');
  });

  it('throws an error event with the hint and request id the server sent', async () => {
    const body = describeError(rejected, 500).body;
    const text: string[] = [];
    const reading = readSummaryStream(stream({ type: 'content', text: 'Linen' }, { type: 'error', ...body }), (t) => text.push(t));

    await expect(reading).rejects.toMatchObject({ name: 'ApiError', message: 'OpenAI rejected the credentials.', code: 'UPSTREAM_AUTH', hint: 'Check the API key.', requestId: body.requestId });
    expect(text).toEqual(['Linen']);
  });

  it('throws a refused request with the hint and request id the server sent', async () => {
    const { status, body } = describeError(rejected, 500);
    await expect(readSummaryStream(new Response(JSON.stringify(body), { status }), () => {})).rejects.toMatchObject({ status: 502, code: 'UPSTREAM_AUTH', hint: 'Check the API key.', requestId: body.requestId });
  });

  it('throws a gateway error page as a readable error', async () => {
    await expect(readSummaryStream(new Response('<html>Bad gateway</html>', { status: 502 }), () => {})).rejects.toMatchObject({ message: 'Failed to generate summary (502)' });
  });
});
