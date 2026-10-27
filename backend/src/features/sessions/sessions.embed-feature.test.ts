// src/features/sessions/sessions.embed-feature.test.ts

/**
 * A chat message is embedded for recall under the feature name the trace view knows
 * ('session_message'), so its trace step reads "Session message embedded" and isn't taken for
 * a search's query embedding.
 */

import { describe, it, expect, vi } from 'vitest';

const { embed } = vi.hoisted(() => ({ embed: vi.fn(async () => null) }));
vi.mock('@/features/embedding', () => ({ embed, prepareMessageText: (_role: string, content: string) => content }));
vi.mock('../ai-experience/ai-experience.service', () => ({}));
vi.mock('./sessions.repository', () => ({
  getSessionById: vi.fn(async () => ({ id: 's', status: 'active' })),
  getNextTurnIndex: vi.fn(async () => 1),
  addMessage: vi.fn(async () => ({ id: 'm1' })),
}));

import { addMessage } from './sessions.service';

describe('embedding a chat message', () => {
  it('names the feature the trace view matches', async () => {
    await addMessage('s', { role: 'user', content: 'Do you have navy sweaters?' } as Parameters<typeof addMessage>[1]);

    expect(embed).toHaveBeenCalledWith('Do you have navy sweaters?', { feature: 'session_message' });
  });
});
