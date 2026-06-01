// src/features/sessions/summarization.service.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockChat = vi.fn();
vi.mock('@/features/ai-service/ai-service.service', () => ({
  chat: (...args: unknown[]) => mockChat(...args),
}));

const mockLoadMessagesForSummarization = vi.fn();
const mockUpdateSession = vi.fn();
vi.mock('./sessions.service', () => ({
  loadMessagesForSummarization: (...args: unknown[]) => mockLoadMessagesForSummarization(...args),
  updateSession: (...args: unknown[]) => mockUpdateSession(...args),
}));

const mockGetSessionById = vi.fn();
vi.mock('./sessions.repository', () => ({
  getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
}));

import { summarizeSession } from './summarization.service';

// ============================================================================
// HELPERS
// ============================================================================

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    summary: null,
    facts: {},
    messageCount: 40,
    summarizedUpTo: 0,
    status: 'active',
    ...overrides,
  };
}

function makeMessages(count: number): Array<{ role: string; content: string; turnIndex: number }> {
  const messages: Array<{ role: string; content: string; turnIndex: number }> = [];
  for (let i = 0; i < count; i++) {
    messages.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i + 1}`,
      turnIndex: i,
    });
  }
  return messages;
}

function makeChatResult(summary: string, facts: Record<string, string>) {
  // Convert facts object to array format matching the new schema
  const factsArray = Object.entries(facts).map(([key, value]) => ({ key, value }));
  return {
    message: {
      role: 'assistant',
      content: JSON.stringify({ summary, facts: factsArray }),
    },
    usage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
    finishReason: 'stop',
    metadata: {
      requestId: 'req-1',
      providerId: 'p-1',
      providerKey: 'openai',
      modelId: 1,
      modelKey: 'gpt-4o-mini',
      durationMs: 1200,
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('summarizeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when no messages need summarization', async () => {
    mockLoadMessagesForSummarization.mockResolvedValue([]);

    const result = await summarizeSession('session-1', 20);

    expect(result.performed).toBe(false);
    expect(result.messagesSummarized).toBe(0);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('summarizes messages and updates session', async () => {
    const messages = makeMessages(10);
    mockLoadMessagesForSummarization.mockResolvedValue(messages);
    mockGetSessionById.mockResolvedValue(makeSession());
    mockChat.mockResolvedValue(makeChatResult(
      'The user searched for running shoes and compared Nike and Adidas options.',
      { search_query: 'running shoes', brands_compared: 'Nike, Adidas' },
    ));
    mockUpdateSession.mockResolvedValue({});

    const result = await summarizeSession('session-1', 20);

    expect(result.performed).toBe(true);
    expect(result.messagesSummarized).toBe(10);
    expect(result.summary).toContain('running shoes');
    expect(result.facts).toEqual({
      search_query: 'running shoes',
      brands_compared: 'Nike, Adidas',
    });
    expect(result.tokenUsage).toEqual({
      inputTokens: 500,
      outputTokens: 200,
      totalTokens: 700,
    });
  });

  it('merges new facts with existing facts', async () => {
    const messages = makeMessages(5);
    mockLoadMessagesForSummarization.mockResolvedValue(messages);
    mockGetSessionById.mockResolvedValue(makeSession({
      summary: 'Previous summary about shoes.',
      facts: { budget: '$100', search_query: 'shoes' },
    }));
    mockChat.mockResolvedValue(makeChatResult(
      'Extended summary including price comparison.',
      { search_query: 'running shoes under $80', preferred_brand: 'Nike' },
    ));
    mockUpdateSession.mockResolvedValue({});

    const result = await summarizeSession('session-1', 20);

    // New facts override old ones (search_query updated), old facts preserved (budget kept)
    expect(result.facts).toEqual({
      budget: '$100',
      search_query: 'running shoes under $80',
      preferred_brand: 'Nike',
    });
  });

  it('updates summarizedUpTo to the last summarized turn + 1', async () => {
    const messages = makeMessages(6); // turnIndex 0-5
    mockLoadMessagesForSummarization.mockResolvedValue(messages);
    mockGetSessionById.mockResolvedValue(makeSession());
    mockChat.mockResolvedValue(makeChatResult('Summary', {}));
    mockUpdateSession.mockResolvedValue({});

    await summarizeSession('session-1', 20);

    expect(mockUpdateSession).toHaveBeenCalledWith('session-1', expect.objectContaining({
      summarizedUpTo: 6, // last turnIndex (5) + 1
    }));
  });

  it('passes existing summary to AI as context', async () => {
    mockLoadMessagesForSummarization.mockResolvedValue(makeMessages(3));
    mockGetSessionById.mockResolvedValue(makeSession({
      summary: 'User is looking for laptops under $1000.',
    }));
    mockChat.mockResolvedValue(makeChatResult('Updated summary', {}));
    mockUpdateSession.mockResolvedValue({});

    await summarizeSession('session-1', 20);

    const chatCall = mockChat.mock.calls[0][0] as Array<{ role: string; content: string }>;
    const systemPrompt = chatCall[0].content;
    expect(systemPrompt).toContain('User is looking for laptops under $1000');
  });

  it('uses configured provider and model', async () => {
    mockLoadMessagesForSummarization.mockResolvedValue(makeMessages(3));
    mockGetSessionById.mockResolvedValue(makeSession());
    mockChat.mockResolvedValue(makeChatResult('Summary', {}));
    mockUpdateSession.mockResolvedValue({});

    await summarizeSession('session-1', 20, {
      providerId: 'provider-abc',
      modelId: 42,
      maxTokens: 500,
    });

    const chatOptions = mockChat.mock.calls[0][1];
    expect(chatOptions.providerId).toBe('provider-abc');
    expect(chatOptions.modelId).toBe(42);
    expect(chatOptions.maxTokens).toBe(500);
    expect(chatOptions.temperature).toBe(0.1);
  });

  it('uses low temperature for consistency', async () => {
    mockLoadMessagesForSummarization.mockResolvedValue(makeMessages(3));
    mockGetSessionById.mockResolvedValue(makeSession());
    mockChat.mockResolvedValue(makeChatResult('Summary', {}));
    mockUpdateSession.mockResolvedValue({});

    await summarizeSession('session-1', 20);

    const chatOptions = mockChat.mock.calls[0][1];
    expect(chatOptions.temperature).toBe(0.1);
  });

  it('uses structured JSON output format', async () => {
    mockLoadMessagesForSummarization.mockResolvedValue(makeMessages(3));
    mockGetSessionById.mockResolvedValue(makeSession());
    mockChat.mockResolvedValue(makeChatResult('Summary', {}));
    mockUpdateSession.mockResolvedValue({});

    await summarizeSession('session-1', 20);

    const chatOptions = mockChat.mock.calls[0][1];
    expect(chatOptions.responseFormat).toBeDefined();
    expect(chatOptions.responseFormat.type).toBe('json_schema');
  });

  it('handles AI failure gracefully (non-fatal)', async () => {
    mockLoadMessagesForSummarization.mockResolvedValue(makeMessages(5));
    mockGetSessionById.mockResolvedValue(makeSession());
    mockChat.mockRejectedValue(new Error('AI service unavailable'));

    const result = await summarizeSession('session-1', 20);

    expect(result.performed).toBe(false);
    expect(result.messagesSummarized).toBe(0);
    // Session should NOT be updated on failure
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  it('returns early when session not found', async () => {
    mockLoadMessagesForSummarization.mockResolvedValue(makeMessages(5));
    mockGetSessionById.mockResolvedValue(null);

    const result = await summarizeSession('missing-session', 20);

    expect(result.performed).toBe(false);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('formats conversation messages as [role]: content', async () => {
    const messages = [
      { role: 'user', content: 'Find me shoes', turnIndex: 0 },
      { role: 'assistant', content: 'Here are some shoes...', turnIndex: 1 },
    ];
    mockLoadMessagesForSummarization.mockResolvedValue(messages);
    mockGetSessionById.mockResolvedValue(makeSession());
    mockChat.mockResolvedValue(makeChatResult('Summary', {}));
    mockUpdateSession.mockResolvedValue({});

    await summarizeSession('session-1', 20);

    const chatCall = mockChat.mock.calls[0][0] as Array<{ role: string; content: string }>;
    const userMessage = chatCall[1].content;
    expect(userMessage).toContain('[user]: Find me shoes');
    expect(userMessage).toContain('[assistant]: Here are some shoes...');
  });
});
