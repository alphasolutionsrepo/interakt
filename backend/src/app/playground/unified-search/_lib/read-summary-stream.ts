// app/playground/unified-search/_lib/read-summary-stream.ts

import { apiErrorFrom, toApiError } from '@/shared/api/api-error';
import { streamEvents } from '@/shared/api/stream-events';

const FAILED = 'Failed to generate summary';

/**
 * Read a summary stream, passing each piece of text on as it arrives. A failure, before
 * the stream starts or as its error event, is thrown as an ApiError with the hint and
 * request id the server sent.
 */
export async function readSummaryStream(response: Response, onText: (text: string) => void): Promise<void> {
  if (!response.ok) throw await toApiError(response, FAILED);

  for await (const event of streamEvents<{ type?: string; text?: string; message?: string; error?: string }>(response)) {
    if (event.type === 'content') onText(event.text ?? '');
    // The error body a failed response has; the stream had already started, so its status isn't sent
    else if (event.type === 'error') throw apiErrorFrom(event, 500, FAILED);
  }
}
