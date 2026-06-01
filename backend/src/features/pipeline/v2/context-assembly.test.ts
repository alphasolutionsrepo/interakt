import { describe, it, expect, vi } from 'vitest';

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

// ============================================================================
// IMPORTS
// ============================================================================

import { assembleContext } from './context-assembly';
import type {
  SessionData,
  ContextAssemblyDeps,
} from './context-assembly';
import type { ContextAssemblyInput } from './v2.types';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function makeToolAssignment(overrides: Partial<{
  slug: string;
  name: string;
  isEnabled: boolean;
  isActive: boolean;
  description: string;
  executorType: string;
  operation: string | null;
  inputSchema: Record<string, unknown> | null;
  dataSourceId: string | null;
}> = {}) {
  const slug = overrides.slug ?? 'product-search';
  return {
    isEnabled: overrides.isEnabled ?? true,
    overrideAiDescription: null,
    tool: {
      id: `tool-${slug}`,
      name: overrides.name ?? slug,
      slug,
      executorType: overrides.executorType ?? 'data_source',
      operation: overrides.operation ?? 'search',
      aiDescription: overrides.description ?? `Search for products`,
      inputSchema: overrides.inputSchema ?? {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          maxPrice: { type: 'number', description: 'Maximum price' },
        },
        required: ['query'],
      },
      isActive: overrides.isActive ?? true,
      dataSourceId: overrides.dataSourceId ?? 'ds-1',
      displayConfig: null,
    },
  };
}

function makeExperience(overrides: Partial<ContextAssemblyInput['experience']> = {}): ContextAssemblyInput['experience'] {
  return {
    id: 'exp-1',
    slug: 'test-experience',
    providerId: 'provider-1',
    modelId: 1,
    personaConfig: {
      systemInstructions: 'You are a helpful shopping assistant.',
      businessDomains: ['E-commerce', 'Retail'],
      tone: 'friendly',
      name: 'ShopBot',
    },
    sessionConfig: {
      maxContextMessages: 6,
    },
    tools: [makeToolAssignment()],
    ...overrides,
  };
}

function makeSessionData(overrides: Partial<SessionData> = {}): SessionData {
  return {
    session: {
      id: 'session-123',
      summary: null,
      facts: null,
      pipelineState: null,
      userContext: null,
      messageCount: 0,
      status: 'active',
      ...overrides.session,
    },
    messages: overrides.messages ?? [],
  };
}

function makeInput(overrides: Partial<ContextAssemblyInput> = {}): ContextAssemblyInput {
  return {
    sessionId: 'session-123',
    experienceId: 'exp-1',
    userMessage: 'Search for red shoes',
    experience: makeExperience(),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ContextAssemblyDeps> = {}): ContextAssemblyDeps {
  return {
    sessionLoader: {
      getSessionWithWindow: vi.fn().mockResolvedValue(makeSessionData()),
      createSession: vi.fn().mockResolvedValue(makeSessionData()),
    },
    episodicMemoryLoader: {
      retrieveRelevantMemories: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('S2: Context Assembly', () => {
  describe('basic assembly', () => {
    it('produces a valid TurnContext for a simple session', async () => {
      const deps = makeDeps();
      const result = await assembleContext(makeInput(), deps);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const ctx = result.data!;

      expect(ctx.userMessage).toBe('Search for red shoes');
      expect(ctx.sessionId).toBe('session-123');
      expect(ctx.experienceId).toBe('exp-1');
      expect(ctx.experienceSlug).toBe('test-experience');
      expect(ctx.personaInstructions).toBe('You are a helpful shopping assistant.');
      expect(ctx.businessDomain).toBe('E-commerce, Retail');
      expect(ctx.providerId).toBe('provider-1');
      expect(ctx.modelId).toBe(1);
    });

    it('loads session with configured window size from experience', async () => {
      const deps = makeDeps();
      const input = makeInput();
      await assembleContext(input, deps);

      expect(deps.sessionLoader.getSessionWithWindow).toHaveBeenCalledWith('session-123', 6);
    });

    it('uses default window size when experience config is missing', async () => {
      const deps = makeDeps();
      const input = makeInput({
        experience: makeExperience({ sessionConfig: {} }),
      });
      await assembleContext(input, deps);

      expect(deps.sessionLoader.getSessionWithWindow).toHaveBeenCalledWith('session-123', 10);
    });
  });

  describe('session resolution', () => {
    it('creates new session when sessionId is not provided', async () => {
      const newSession = makeSessionData({ session: { id: 'new-session', summary: null, facts: null, pipelineState: null, userContext: null, messageCount: 0, status: 'active' } });
      const deps = makeDeps({
        sessionLoader: {
          getSessionWithWindow: vi.fn(),
          createSession: vi.fn().mockResolvedValue(newSession),
        },
      });

      const input = makeInput({ sessionId: '' });
      const result = await assembleContext(input, deps);

      expect(result.success).toBe(true);
      expect(result.data!.sessionId).toBe('new-session');
      expect(deps.sessionLoader.createSession).toHaveBeenCalledWith('exp-1', 1440);
    });

    it('creates new session when existing session is not found', async () => {
      const newSession = makeSessionData({ session: { id: 'new-session', summary: null, facts: null, pipelineState: null, userContext: null, messageCount: 0, status: 'active' } });
      const deps = makeDeps({
        sessionLoader: {
          getSessionWithWindow: vi.fn().mockResolvedValue(null),
          createSession: vi.fn().mockResolvedValue(newSession),
        },
      });

      const result = await assembleContext(makeInput(), deps);
      expect(result.data!.sessionId).toBe('new-session');
    });

    it('creates new session when existing session is expired', async () => {
      const expiredSession = makeSessionData({ session: { id: 'session-123', summary: null, facts: null, pipelineState: null, userContext: null, messageCount: 5, status: 'expired' } });
      const newSession = makeSessionData({ session: { id: 'new-session', summary: null, facts: null, pipelineState: null, userContext: null, messageCount: 0, status: 'active' } });
      const deps = makeDeps({
        sessionLoader: {
          getSessionWithWindow: vi.fn().mockResolvedValue(expiredSession),
          createSession: vi.fn().mockResolvedValue(newSession),
        },
      });

      const result = await assembleContext(makeInput(), deps);
      expect(result.data!.sessionId).toBe('new-session');
    });
  });

  describe('conversation history', () => {
    it('maps messages to TurnContextMessage format', async () => {
      const deps = makeDeps({
        sessionLoader: {
          getSessionWithWindow: vi.fn().mockResolvedValue(makeSessionData({
            messages: [
              { role: 'user', content: 'Hello', createdAt: new Date('2026-03-13T10:00:00Z') },
              { role: 'assistant', content: 'Hi there!', createdAt: new Date('2026-03-13T10:00:01Z') },
            ],
          })),
          createSession: vi.fn(),
        },
      });

      const result = await assembleContext(makeInput(), deps);
      const ctx = result.data!;

      expect(ctx.conversationHistory).toHaveLength(2);
      expect(ctx.conversationHistory[0]).toEqual({
        role: 'user',
        content: 'Hello',
        timestamp: '2026-03-13T10:00:00.000Z',
      });
      expect(ctx.conversationHistory[1]).toEqual({
        role: 'assistant',
        content: 'Hi there!',
        timestamp: '2026-03-13T10:00:01.000Z',
      });
    });

    it('handles empty conversation history', async () => {
      const deps = makeDeps();
      const result = await assembleContext(makeInput(), deps);

      expect(result.data!.conversationHistory).toEqual([]);
    });
  });

  describe('session facts', () => {
    it('loads session facts from session data', async () => {
      const deps = makeDeps({
        sessionLoader: {
          getSessionWithWindow: vi.fn().mockResolvedValue(makeSessionData({
            session: {
              id: 'session-123',
              summary: null,
              facts: { budget: '$100', preferredColor: 'red' },
              pipelineState: null,
              userContext: null,
              messageCount: 4,
              status: 'active',
            },
          })),
          createSession: vi.fn(),
        },
      });

      const result = await assembleContext(makeInput(), deps);
      expect(result.data!.sessionFacts).toEqual({
        budget: '$100',
        preferredColor: 'red',
      });
    });

    it('defaults to empty facts when session has none', async () => {
      const deps = makeDeps();
      const result = await assembleContext(makeInput(), deps);
      expect(result.data!.sessionFacts).toEqual({});
    });
  });

  describe('conversation summary', () => {
    it('loads conversation summary from session', async () => {
      const deps = makeDeps({
        sessionLoader: {
          getSessionWithWindow: vi.fn().mockResolvedValue(makeSessionData({
            session: {
              id: 'session-123',
              summary: 'User has been looking for red shoes under $100',
              facts: null,
              pipelineState: null,
              userContext: null,
              messageCount: 30,
              status: 'active',
            },
          })),
          createSession: vi.fn(),
        },
      });

      const result = await assembleContext(makeInput(), deps);
      expect(result.data!.conversationSummary).toBe('User has been looking for red shoes under $100');
    });

    it('returns null summary when session has none', async () => {
      const deps = makeDeps();
      const result = await assembleContext(makeInput(), deps);
      expect(result.data!.conversationSummary).toBeNull();
    });
  });

  describe('result memory', () => {
    it('loads result memory from pipeline state', async () => {
      const resultMemory = {
        sets: {
          'product-search': {
            toolSlug: 'product-search',
            executedAt: '2026-03-13T10:00:00Z',
            results: [{ id: 'prod-1', name: 'Red Shoes' }],
            totalCount: 1,
          },
        },
        referenceIndex: [
          {
            ordinal: 1,
            toolSlug: 'product-search',
            resultId: 'prod-1',
            snapshot: { title: 'Red Shoes', price: '$89' },
          },
        ],
      };

      const deps = makeDeps({
        sessionLoader: {
          getSessionWithWindow: vi.fn().mockResolvedValue(makeSessionData({
            session: {
              id: 'session-123',
              summary: null,
              facts: null,
              pipelineState: { result_memory: resultMemory },
              userContext: null,
              messageCount: 2,
              status: 'active',
            },
          })),
          createSession: vi.fn(),
        },
      });

      const result = await assembleContext(makeInput(), deps);
      const ctx = result.data!;

      expect(ctx.resultMemory).toEqual(resultMemory);
      expect(ctx.resultMemoryIndex).toHaveLength(1);
      expect(ctx.resultMemoryIndex[0].ordinal).toBe(1);
      expect(ctx.resultMemoryIndex[0].resultId).toBe('prod-1');
    });

    it('defaults to empty result memory when pipeline state is null', async () => {
      const deps = makeDeps();
      const result = await assembleContext(makeInput(), deps);

      expect(result.data!.resultMemory).toEqual({ sets: {}, referenceIndex: [] });
      expect(result.data!.resultMemoryIndex).toEqual([]);
    });
  });

  describe('tool context', () => {
    it('builds tool summaries from enabled, active tools', async () => {
      const input = makeInput({
        experience: makeExperience({
          tools: [
            makeToolAssignment({ slug: 'product-search', description: 'Search products', operation: 'search' }),
            makeToolAssignment({ slug: 'product-lookup', description: 'Look up product details', operation: 'lookup' }),
          ],
        }),
      });

      const result = await assembleContext(input, makeDeps());
      const ctx = result.data!;

      expect(ctx.availableTools).toHaveLength(2);
      expect(ctx.availableTools[0]).toEqual({
        slug: 'product-search',
        name: 'product-search',
        description: 'Search products',
        operation: 'search',
        executorType: 'data_source',
      });
      expect(ctx.availableTools[1].slug).toBe('product-lookup');
    });

    it('builds full tool definitions with input schemas', async () => {
      const result = await assembleContext(makeInput(), makeDeps());
      const ctx = result.data!;

      expect(ctx.toolDefinitions).toHaveLength(1);
      expect(ctx.toolDefinitions[0].slug).toBe('product-search');
      expect(ctx.toolDefinitions[0].inputSchema).toEqual({
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          maxPrice: { type: 'number', description: 'Maximum price' },
        },
        required: ['query'],
      });
    });

    it('builds slug → id mapping', async () => {
      const result = await assembleContext(makeInput(), makeDeps());
      expect(result.data!.toolSlugToId).toEqual({ 'product-search': 'tool-product-search' });
    });

    it('excludes disabled tool assignments', async () => {
      const input = makeInput({
        experience: makeExperience({
          tools: [
            makeToolAssignment({ slug: 'active-tool' }),
            makeToolAssignment({ slug: 'disabled-tool', isEnabled: false }),
          ],
        }),
      });

      const result = await assembleContext(input, makeDeps());
      expect(result.data!.availableTools).toHaveLength(1);
      expect(result.data!.availableTools[0].slug).toBe('active-tool');
    });

    it('excludes inactive tools', async () => {
      const input = makeInput({
        experience: makeExperience({
          tools: [
            makeToolAssignment({ slug: 'active-tool' }),
            makeToolAssignment({ slug: 'inactive-tool', isActive: false }),
          ],
        }),
      });

      const result = await assembleContext(input, makeDeps());
      expect(result.data!.availableTools).toHaveLength(1);
      expect(result.data!.availableTools[0].slug).toBe('active-tool');
    });

    it('uses override description when present', async () => {
      const input = makeInput({
        experience: makeExperience({
          tools: [{
            isEnabled: true,
            overrideAiDescription: 'Custom search description',
            tool: {
              id: 'tool-1',
              name: 'product-search',
              slug: 'product-search',
              executorType: 'data_source',
              operation: 'search',
              aiDescription: 'Original description',
              inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
              isActive: true,
              dataSourceId: 'ds-1',
              displayConfig: null,
            },
          }],
        }),
      });

      const result = await assembleContext(input, makeDeps());
      expect(result.data!.availableTools[0].description).toBe('Custom search description');
      expect(result.data!.toolDefinitions[0].description).toBe('Custom search description');
    });

    it('provides default schema when tool has no input schema', async () => {
      const input = makeInput({
        experience: makeExperience({
          tools: [makeToolAssignment({ slug: 'no-schema-tool', inputSchema: null })],
        }),
      });

      const result = await assembleContext(input, makeDeps());
      const schema = result.data!.toolDefinitions[0].inputSchema;
      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('query');
    });
  });

  describe('episodic memory', () => {
    it('loads episodic memories when user has userId', async () => {
      const deps = makeDeps({
        sessionLoader: {
          getSessionWithWindow: vi.fn().mockResolvedValue(makeSessionData({
            session: {
              id: 'session-123',
              summary: null,
              facts: null,
              pipelineState: null,
              userContext: { userId: 'user-1', displayName: 'Test User' },
              messageCount: 0,
              status: 'active',
            },
          })),
          createSession: vi.fn(),
        },
        episodicMemoryLoader: {
          retrieveRelevantMemories: vi.fn().mockResolvedValue([
            'User prefers red shoes',
            'Budget is around $100',
          ]),
        },
      });

      const input = makeInput({
        experience: makeExperience({ sessionConfig: { enableUserContext: true } }),
      });
      const result = await assembleContext(input, deps);
      expect(result.data!.episodicMemories).toEqual([
        'User prefers red shoes',
        'Budget is around $100',
      ]);
      expect(deps.episodicMemoryLoader.retrieveRelevantMemories).toHaveBeenCalledWith(
        'user-1',
        'exp-1',
        'Search for red shoes',
        3,
      );
    });

    it('returns empty memories for anonymous sessions (no userId)', async () => {
      const deps = makeDeps({
        episodicMemoryLoader: {
          retrieveRelevantMemories: vi.fn(),
        },
      });

      const result = await assembleContext(makeInput(), deps);
      expect(result.data!.episodicMemories).toEqual([]);
      expect(deps.episodicMemoryLoader.retrieveRelevantMemories).not.toHaveBeenCalled();
    });

    it('returns empty memories on episodic retrieval failure (non-fatal)', async () => {
      const deps = makeDeps({
        sessionLoader: {
          getSessionWithWindow: vi.fn().mockResolvedValue(makeSessionData({
            session: {
              id: 'session-123',
              summary: null,
              facts: null,
              pipelineState: null,
              userContext: { userId: 'user-1' },
              messageCount: 0,
              status: 'active',
            },
          })),
          createSession: vi.fn(),
        },
        episodicMemoryLoader: {
          retrieveRelevantMemories: vi.fn().mockRejectedValue(new Error('Embedding service down')),
        },
      });

      const result = await assembleContext(makeInput(), deps);
      // Should succeed — episodic memory failure is non-fatal
      expect(result.success).toBe(true);
      expect(result.data!.episodicMemories).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('returns failure when session loader throws', async () => {
      const deps = makeDeps({
        sessionLoader: {
          getSessionWithWindow: vi.fn().mockRejectedValue(new Error('DB connection failed')),
          createSession: vi.fn(),
        },
      });

      const result = await assembleContext(makeInput(), deps);
      expect(result.success).toBe(false);
      expect(result.summary).toContain('DB connection failed');
    });
  });

  describe('module result metadata', () => {
    it('includes duration in result', async () => {
      const result = await assembleContext(makeInput(), makeDeps());
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('includes summary with counts', async () => {
      const result = await assembleContext(makeInput(), makeDeps());
      expect(result.summary).toContain('0 messages');
      expect(result.summary).toContain('1 tools');
      expect(result.summary).toContain('0 memories');
    });
  });
});
