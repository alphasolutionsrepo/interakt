// shared/ui/custom/start-experience-chat.ts

import { postForEvents } from '@/shared/api/stream-events';

/**
 * Send a message to an AI experience's chat as the signed-in admin (a test, not live
 * traffic): the answer's events. A refusal throws an ApiError with the server's
 * reason; the help drawer reads a 404 as its assistant not being built yet.
 */
export async function startExperienceChat<T = Record<string, unknown>>(
  slug: string,
  message: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<AsyncGenerator<T>> {
  return postForEvents<T>(`/api/v1/ai-experiences/${slug}/chat`, { message, sessionId }, 'Failed to send message', signal);
}
