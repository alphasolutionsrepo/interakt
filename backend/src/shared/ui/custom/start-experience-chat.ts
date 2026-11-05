// shared/ui/custom/start-experience-chat.ts

import { postForEvents } from '@/shared/api/stream-events';

/**
 * Send a message to an AI experience's chat as the signed-in admin (a test, not live
 * traffic): the answer's event stream. A refusal throws an ApiError with the server's
 * reason; the help drawer reads a 404 as its assistant not being built yet.
 */
export async function startExperienceChat(
  slug: string,
  message: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  return postForEvents(`/api/v1/ai-experiences/${slug}/chat`, { message, sessionId }, 'Failed to send message', signal);
}
