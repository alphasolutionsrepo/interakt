// shared/ui/custom/help-chat-error.ts

import { apiErrorFrom, errorText, type ApiError, type ApiErrorBody } from '@/shared/api/api-error';

/**
 * An error event in the help assistant's answer stream: the error for the Activity
 * panel (with its request id), and what the answer says. The server sends its reason
 * in `message`.
 */
export function helpChatError(event: ApiErrorBody): { error: ApiError; reply: string } {
  const error = apiErrorFrom(event, 500, 'The assistant could not answer');
  return { error, reply: `Sorry — something went wrong: ${errorText(error, '')}` };
}
