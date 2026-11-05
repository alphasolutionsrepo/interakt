// app/playground/search/_lib/read-suggestions.ts

import { handleApiResponse } from '@/shared/api/api-error';

/**
 * The suggestions an autocomplete response holds. A failed response is thrown as an
 * ApiError, with the hint and request id the server sent.
 */
export async function readSuggestions<T extends { suggestions: unknown[] }>(response: Response): Promise<T> {
  const result = await handleApiResponse<T | undefined>(response, 'Suggestions failed');
  if (!Array.isArray(result?.suggestions)) throw new Error('Invalid response');
  return result;
}
