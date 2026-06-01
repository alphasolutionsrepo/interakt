import { describe, it, expect } from 'vitest';
import {
  createSessionSchema,
  addMessageSchema,
  updateSessionSchema,
  listSessionsQuerySchema,
  messageMetadataSchema,
  userContextSchema,
  lastToolResultsSchema,
} from './sessions.validation';

// ============================================================================
// HELPERS — minimal valid payloads
// ============================================================================

const validUuid = '550e8400-e29b-41d4-a716-446655440000';

const validCreateSession = {
  aiExperienceId: validUuid,
  ttlMinutes: 1440,
};

const validAddMessage = {
  role: 'user' as const,
  content: 'Hello, can you help me find a product?',
};

const validMetadata = {
  toolCalls: [{
    toolId: validUuid,
    toolName: 'product_search',
    input: { query: 'red shoes' },
    durationMs: 150,
  }],
  tokenUsage: {
    promptTokens: 500,
    completionTokens: 200,
    totalTokens: 700,
  },
  latencyMs: 1200,
  stepTrace: [{
    stepId: 'intent-1',
    stepType: 'intent_detection',
    durationMs: 50,
    status: 'success' as const,
  }],
};

// ============================================================================
// CREATE SESSION SCHEMA
// ============================================================================

describe('createSessionSchema', () => {
  it('accepts minimal valid input', () => {
    const result = createSessionSchema.safeParse(validCreateSession);
    expect(result.success).toBe(true);
  });

  it('accepts input with clientMetadata and userContext', () => {
    const result = createSessionSchema.safeParse({
      ...validCreateSession,
      clientMetadata: { device: 'mobile', page: '/products' },
      userContext: { userId: 'user-123', displayName: 'John' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing aiExperienceId', () => {
    const result = createSessionSchema.safeParse({ ttlMinutes: 1440 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID for aiExperienceId', () => {
    const result = createSessionSchema.safeParse({
      aiExperienceId: 'not-a-uuid',
      ttlMinutes: 1440,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing ttlMinutes', () => {
    const result = createSessionSchema.safeParse({
      aiExperienceId: validUuid,
    });
    expect(result.success).toBe(false);
  });

  it('rejects ttlMinutes below minimum (1)', () => {
    const result = createSessionSchema.safeParse({
      aiExperienceId: validUuid,
      ttlMinutes: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects ttlMinutes above maximum (43200)', () => {
    const result = createSessionSchema.safeParse({
      aiExperienceId: validUuid,
      ttlMinutes: 50000,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// ADD MESSAGE SCHEMA
// ============================================================================

describe('addMessageSchema', () => {
  it('accepts minimal user message', () => {
    const result = addMessageSchema.safeParse(validAddMessage);
    expect(result.success).toBe(true);
  });

  it('accepts all message roles', () => {
    for (const role of ['user', 'assistant', 'system', 'tool_result']) {
      const result = addMessageSchema.safeParse({ role, content: 'test' });
      expect(result.success).toBe(true);
    }
  });

  it('accepts message with full metadata', () => {
    const result = addMessageSchema.safeParse({
      ...validAddMessage,
      metadata: validMetadata,
    });
    expect(result.success).toBe(true);
  });

  it('accepts message with partial metadata', () => {
    const result = addMessageSchema.safeParse({
      ...validAddMessage,
      metadata: { latencyMs: 500 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = addMessageSchema.safeParse({ role: 'user', content: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const result = addMessageSchema.safeParse({ role: 'admin', content: 'test' });
    expect(result.success).toBe(false);
  });

  it('rejects missing role', () => {
    const result = addMessageSchema.safeParse({ content: 'test' });
    expect(result.success).toBe(false);
  });

  it('rejects missing content', () => {
    const result = addMessageSchema.safeParse({ role: 'user' });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// MESSAGE METADATA SCHEMA
// ============================================================================

describe('messageMetadataSchema', () => {
  it('accepts empty metadata', () => {
    const result = messageMetadataSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts full metadata', () => {
    const result = messageMetadataSchema.safeParse(validMetadata);
    expect(result.success).toBe(true);
  });

  it('accepts metadata with responseData', () => {
    const result = messageMetadataSchema.safeParse({
      responseData: { preset: 'item_grid', content: { items: [] } },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid step trace status', () => {
    const result = messageMetadataSchema.safeParse({
      stepTrace: [{ stepId: 's1', stepType: 'test', durationMs: 10, status: 'unknown' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative token counts', () => {
    const result = messageMetadataSchema.safeParse({
      tokenUsage: { promptTokens: -1, completionTokens: 0, totalTokens: 0 },
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// USER CONTEXT SCHEMA
// ============================================================================

describe('userContextSchema', () => {
  it('accepts empty context', () => {
    const result = userContextSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts full context', () => {
    const result = userContextSchema.safeParse({
      userId: 'user-123',
      displayName: 'John Doe',
      preferences: { theme: 'dark' },
      permissions: ['read', 'write'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects overly long display name', () => {
    const result = userContextSchema.safeParse({
      displayName: 'x'.repeat(256),
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// LAST TOOL RESULTS SCHEMA
// ============================================================================

describe('lastToolResultsSchema', () => {
  it('accepts empty results', () => {
    const result = lastToolResultsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid tool results', () => {
    const result = lastToolResultsSchema.safeParse({
      search: {
        toolId: validUuid,
        toolName: 'product_search',
        result: { items: [{ id: '1', name: 'Product' }] },
        executedAt: '2026-03-07T10:00:00.000Z',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts multiple tool results', () => {
    const result = lastToolResultsSchema.safeParse({
      search: {
        toolId: validUuid,
        toolName: 'product_search',
        result: [],
        executedAt: '2026-03-07T10:00:00.000Z',
      },
      lookup: {
        toolId: validUuid,
        toolName: 'product_lookup',
        result: { id: '1' },
        executedAt: '2026-03-07T10:01:00.000Z',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects entry missing toolId', () => {
    const result = lastToolResultsSchema.safeParse({
      search: {
        toolName: 'product_search',
        result: [],
        executedAt: '2026-03-07T10:00:00.000Z',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects entry with invalid executedAt', () => {
    const result = lastToolResultsSchema.safeParse({
      search: {
        toolId: validUuid,
        toolName: 'product_search',
        result: [],
        executedAt: 'not-a-date',
      },
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// UPDATE SESSION SCHEMA
// ============================================================================

describe('updateSessionSchema', () => {
  it('accepts summary update', () => {
    const result = updateSessionSchema.safeParse({ summary: 'User was looking for shoes.' });
    expect(result.success).toBe(true);
  });

  it('accepts facts update', () => {
    const result = updateSessionSchema.safeParse({
      facts: { budget: '$50', intent: 'compare' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts pipeline state update', () => {
    const result = updateSessionSchema.safeParse({
      pipelineState: {
        intent_detection: { lastIntent: 'search', confidence: 0.9 },
        constraint_extraction: { filters: [] },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts status update', () => {
    const result = updateSessionSchema.safeParse({ status: 'archived' });
    expect(result.success).toBe(true);
  });

  it('accepts combined update', () => {
    const result = updateSessionSchema.safeParse({
      summary: 'Looking for shoes',
      facts: { budget: '$50' },
      summarizedUpTo: 15,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty update', () => {
    const result = updateSessionSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const result = updateSessionSchema.safeParse({ status: 'deleted' });
    expect(result.success).toBe(false);
  });

  it('rejects negative summarizedUpTo', () => {
    const result = updateSessionSchema.safeParse({ summarizedUpTo: -1 });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// LIST SESSIONS QUERY SCHEMA
// ============================================================================

describe('listSessionsQuerySchema', () => {
  it('accepts empty query (defaults applied)', () => {
    const result = listSessionsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(25);
      expect(result.data.sortBy).toBe('lastActiveAt');
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('accepts full query', () => {
    const result = listSessionsQuerySchema.safeParse({
      aiExperienceId: validUuid,
      status: 'active',
      page: 2,
      pageSize: 10,
      sortBy: 'createdAt',
      sortOrder: 'asc',
    });
    expect(result.success).toBe(true);
  });

  it('coerces string numbers for pagination', () => {
    const result = listSessionsQuerySchema.safeParse({ page: '3', pageSize: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.pageSize).toBe(50);
    }
  });

  it('rejects invalid status', () => {
    const result = listSessionsQuerySchema.safeParse({ status: 'deleted' });
    expect(result.success).toBe(false);
  });

  it('rejects pageSize above 100', () => {
    const result = listSessionsQuerySchema.safeParse({ pageSize: 101 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid sortBy', () => {
    const result = listSessionsQuerySchema.safeParse({ sortBy: 'name' });
    expect(result.success).toBe(false);
  });
});
