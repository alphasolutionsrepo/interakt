// src/shared/ui/custom/help-chat-error.test.ts

import { describe, expect, it } from 'vitest';

import { helpChatError } from './help-chat-error';

describe('an error in the help assistant answer', () => {
  it("says the server's reason, and keeps its request id for the Activity panel", () => {
    const { error, reply } = helpChatError({ type: 'error', message: 'The model is not reachable.', requestId: 'req-1' } as never);
    expect(reply).toBe('Sorry — something went wrong: The model is not reachable.');
    expect(error).toMatchObject({ name: 'ApiError', message: 'The model is not reachable.', requestId: 'req-1' });
  });

  it('adds the hint, when the server sends one', () => {
    expect(helpChatError({ message: 'The model is not reachable.', hint: 'Check the provider.' }).reply).toBe(
      'Sorry — something went wrong: The model is not reachable. Check the provider.',
    );
  });

  it('says the assistant could not answer when the server gives no reason', () => {
    expect(helpChatError({}).reply).toBe('Sorry — something went wrong: The assistant could not answer (500)');
  });
});
