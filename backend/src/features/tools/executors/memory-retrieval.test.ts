// src/features/tools/executors/memory-retrieval.test.ts

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

const mockEmbed = vi.fn();
const mockPrepareMessageText = vi.fn((role: string, content: string) => `[${role}]: ${content}`);
vi.mock('@/features/embedding', () => ({
  embed: (...args: unknown[]) => mockEmbed(...args),
  prepareMessageText: (role: string, content: string) => mockPrepareMessageText(role, content),
}));

const mockSearchMessages = vi.fn();
const mockSearchMessagesByVector = vi.fn();
vi.mock('@/features/sessions/sessions.repository', () => ({
  searchMessages: (...args: unknown[]) => mockSearchMessages(...args),
  searchMessagesByVector: (...args: unknown[]) => mockSearchMessagesByVector(...args),
}));

import { executeMemoryRetrieval, MEMORY_RETRIEVAL_TOOL_DEFINITION } from './memory-retrieval';

// ============================================================================
// HELPERS
// ============================================================================

function makeMessage(turnIndex: number, role = 'user', content = `Message ${turnIndex}`) {
  return {
    id: `msg-${turnIndex}`,
    sessionId: 'session-1',
    role,
    content,
    turnIndex,
    metadata: null,
    createdAt: new Date(),
  };
}

function makeVectorResult(turnIndex: number, distance: number, role = 'assistant', content = `Response ${turnIndex}`) {
  return {
    id: `msg-${turnIndex}`,
    role,
    content,
    turnIndex,
    distance,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('executeMemoryRetrieval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchMessages.mockResolvedValue([]);
    mockSearchMessagesByVector.mockResolvedValue([]);
    mockEmbed.mockResolvedValue(null);
  });

  // ── Input Validation ─────────────────────────────────────────────────────

  it('returns error when query is missing', async () => {
    const result = await executeMemoryRetrieval({}, { sessionId: 'session-1' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('query');
  });

  it('returns error when sessionId is missing', async () => {
    const result = await executeMemoryRetrieval({}, { query: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('sessionId');
  });

  // ── Keyword Search ───────────────────────────────────────────────────────

  it('returns keyword search results when vector search is unavailable', async () => {
    mockSearchMessages.mockResolvedValue([
      makeMessage(3, 'user', 'I want running shoes'),
      makeMessage(5, 'assistant', 'Here are some running shoes options'),
    ]);

    const result = await executeMemoryRetrieval(
      {},
      { query: 'running shoes', sessionId: 'session-1' },
    );

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    const results = data.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);
    expect(results[0].source).toBe('keyword');
    expect(results[0].turnIndex).toBe(3); // sorted chronologically
    expect(results[1].turnIndex).toBe(5);
  });

  it('returns empty results with helpful message', async () => {
    const result = await executeMemoryRetrieval(
      {},
      { query: 'nonexistent topic', sessionId: 'session-1' },
    );

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect((data.results as unknown[]).length).toBe(0);
    expect(data.message).toContain('No matching messages');
  });

  // ── Vector Search ────────────────────────────────────────────────────────

  it('uses vector search when embeddings are available', async () => {
    const fakeVector = [0.1, 0.2, 0.3];
    mockEmbed.mockResolvedValue(fakeVector);
    mockSearchMessagesByVector.mockResolvedValue([
      makeVectorResult(2, 0.15, 'assistant', 'The budget options are...'),
      makeVectorResult(4, 0.25, 'user', 'What about cheaper ones?'),
    ]);

    const result = await executeMemoryRetrieval(
      {},
      { query: 'budget options', sessionId: 'session-1' },
    );

    expect(result.success).toBe(true);
    expect(mockEmbed).toHaveBeenCalledWith('budget options');
    expect(mockSearchMessagesByVector).toHaveBeenCalledWith(
      'session-1',
      fakeVector,
      10, // default limit
      expect.any(Number),
    );

    const data = result.data as Record<string, unknown>;
    const results = data.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);
    expect(results[0].source).toBe('semantic');
  });

  // ── Hybrid Merge ─────────────────────────────────────────────────────────

  it('merges vector and keyword results without duplicates', async () => {
    const fakeVector = [0.1, 0.2];
    mockEmbed.mockResolvedValue(fakeVector);
    mockSearchMessagesByVector.mockResolvedValue([
      makeVectorResult(5, 0.1, 'user', 'I need Nike shoes'),
    ]);
    mockSearchMessages.mockResolvedValue([
      makeMessage(5, 'user', 'I need Nike shoes'), // same message — should be deduped
      makeMessage(8, 'assistant', 'Nike Air Max is popular'),
    ]);

    const result = await executeMemoryRetrieval(
      {},
      { query: 'Nike shoes', sessionId: 'session-1' },
    );

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    const results = data.results as Array<Record<string, unknown>>;
    // Should have 2, not 3 (msg-5 deduped)
    expect(results).toHaveLength(2);
    expect(results[0].turnIndex).toBe(5);
    expect(results[0].source).toBe('semantic');
    expect(results[1].turnIndex).toBe(8);
    expect(results[1].source).toBe('keyword');
  });

  it('sorts merged results chronologically by turnIndex', async () => {
    mockSearchMessages.mockResolvedValue([
      makeMessage(10, 'user', 'later message'),
      makeMessage(2, 'user', 'earlier message'),
    ]);

    const result = await executeMemoryRetrieval(
      {},
      { query: 'message', sessionId: 'session-1' },
    );

    const data = result.data as Record<string, unknown>;
    const results = data.results as Array<Record<string, unknown>>;
    expect(results[0].turnIndex).toBe(2);
    expect(results[1].turnIndex).toBe(10);
  });

  // ── Limit ────────────────────────────────────────────────────────────────

  it('respects custom limit parameter', async () => {
    mockSearchMessages.mockResolvedValue([
      makeMessage(1), makeMessage(2), makeMessage(3),
    ]);

    await executeMemoryRetrieval(
      {},
      { query: 'test', sessionId: 'session-1', limit: 2 },
    );

    expect(mockSearchMessages).toHaveBeenCalledWith('session-1', 'test', 2);
  });

  it('caps limit at 25', async () => {
    await executeMemoryRetrieval(
      {},
      { query: 'test', sessionId: 'session-1', limit: 100 },
    );

    expect(mockSearchMessages).toHaveBeenCalledWith('session-1', 'test', 25);
  });

  // ── Graceful Failures ────────────────────────────────────────────────────

  it('falls back to keyword search when embedding fails', async () => {
    mockEmbed.mockResolvedValue(null);
    mockSearchMessages.mockResolvedValue([makeMessage(1, 'user', 'test content')]);

    const result = await executeMemoryRetrieval(
      {},
      { query: 'test', sessionId: 'session-1' },
    );

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    const results = data.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('keyword');
  });

  it('falls back to keyword search when vector search throws', async () => {
    mockEmbed.mockResolvedValue([0.1, 0.2]);
    mockSearchMessagesByVector.mockRejectedValue(new Error('pgvector not installed'));
    mockSearchMessages.mockResolvedValue([makeMessage(1)]);

    const result = await executeMemoryRetrieval(
      {},
      { query: 'test', sessionId: 'session-1' },
    );

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect((data.results as unknown[]).length).toBe(1);
  });

  it('returns error when both searches fail', async () => {
    mockSearchMessages.mockRejectedValue(new Error('DB connection lost'));

    const result = await executeMemoryRetrieval(
      {},
      { query: 'test', sessionId: 'session-1' },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to search');
  });

  // ── Tool Definition ──────────────────────────────────────────────────────

  it('exports a valid tool definition', () => {
    expect(MEMORY_RETRIEVAL_TOOL_DEFINITION.name).toBe('memory_retrieval');
    expect(MEMORY_RETRIEVAL_TOOL_DEFINITION.inputSchema.properties.query).toBeDefined();
    expect(MEMORY_RETRIEVAL_TOOL_DEFINITION.inputSchema.required).toContain('query');
  });
});
