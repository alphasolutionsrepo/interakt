// app/playground/search/_lib/read-suggestions.ts

import { handleApiResponse } from '@/shared/api/api-error';
import { TEST_MARKER_HEADER } from '@/shared/constants/test-marker.constants';

/**
 * The suggestions an autocomplete response holds. A failed response is thrown as an
 * ApiError, with the hint and request id the server sent.
 */
export async function readSuggestions<T extends { suggestions: unknown[] }>(response: Response): Promise<T> {
  const result = await handleApiResponse<T | undefined>(response, 'Suggestions failed');
  if (!Array.isArray(result?.suggestions)) throw new Error('Invalid response');
  return result;
}

/**
 * Ask the autocomplete API for suggestions as the playground: with the experience's token
 * and the test marker, so with the admin's login a failure comes back explained rather
 * than as no suggestions. null when the request was aborted.
 */
export function askForSuggestions(
  apiUrl: string,
  accessToken: string,
  body: { query: string; indexId?: string; maxSuggestions?: number },
  signal: AbortSignal,
): Promise<Response | null> {
  // .catch() attached before the caller awaits, so an abort is handled in the same
  // microtask and Next.js's unhandled-rejection handler never sees it
  return fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Access-Token': accessToken, [TEST_MARKER_HEADER]: '1' },
    body: JSON.stringify(body),
    signal,
  }).catch((err: unknown) => {
    if ((err as Error)?.name === 'AbortError') return null;
    throw err;
  });
}
