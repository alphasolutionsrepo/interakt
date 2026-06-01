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

import { planTurn, _validatePlan, _buildSystemPrompt, _buildUserPrompt } from './turn-planner';
import type { TurnPlannerDeps, ChatFn } from './turn-planner';
import type { TurnPlannerInput, ToolSummary } from './v2.types';
import type { ChatResult } from '@/features/ai-service/ai-service.types';

// ============================================================================
// FIXTURES
// ============================================================================

function makeTools(): ToolSummary[] {
  return [
    { slug: 'product-search', name: 'Product Search', description: 'Search for products', operation: 'search', executorType: 'data_source' },
    { slug: 'product-lookup', name: 'Product Lookup', description: 'Look up product details by ID', operation: 'lookup', executorType: 'data_source' },
    { slug: 'add-to-cart', name: 'Add to Cart', description: 'Add a product to cart', operation: null, executorType: 'http' },
  ];
}

function makeInput(overrides: Partial<TurnPlannerInput> = {}): TurnPlannerInput {
  return {
    userMessage: 'Search for red shoes',
    experienceId: 'test-experience-id',
    conversationHistory: [],
    conversationSummary: null,
    turnLog: [],
    sessionFacts: {},
    resultMemoryIndex: [],
    episodicMemories: [],
    availableTools: makeTools(),
    personaInstructions: 'You are a helpful shopping assistant.',
    businessDomain: 'E-commerce',
    ...overrides,
  };
}

function makeChatResult(plan: Record<string, unknown>): ChatResult {
  return {
    message: {
      role: 'assistant',
      content: JSON.stringify(plan),
    },
    usage: { inputTokens: 500, outputTokens: 100, totalTokens: 600 },
    finishReason: 'stop',
    metadata: {
      requestId: 'req-1',
      providerId: 'p1',
      providerKey: 'openai',
      modelId: 1,
      modelKey: 'gpt-4o',
      durationMs: 400,
    },
  };
}

function mockChat(plan: Record<string, unknown>): ChatFn {
  return vi.fn().mockResolvedValue(makeChatResult(plan));
}

function makeDeps(plan: Record<string, unknown>): TurnPlannerDeps {
  return { chat: mockChat(plan) };
}

// ============================================================================
// TESTS
// ============================================================================

describe('D1: Turn Planner', () => {
  describe('planTurn — single action', () => {
    it('plans a single search action', async () => {
      const deps = makeDeps({
        actions: [
          { toolSlug: 'product-search', intent: 'Search for red shoes', hints: '{"query":"red shoes"}', dependsOnPrevious: false },
        ],
        reasoning: 'User wants to search for red shoes',
        directResponse: false,
        needsClarification: false,
        clarificationQuestion: null,
        confidence: 0.95,
      });

      const result = await planTurn(makeInput(), deps);

      expect(result.success).toBe(true);
      expect(result.data!.actions).toHaveLength(1);
      expect(result.data!.actions[0].toolSlug).toBe('product-search');
      expect(result.data!.actions[0].hints).toEqual({ query: 'red shoes' });
      expect(result.data!.confidence).toBe(0.95);
      expect(result.summary).toContain('product-search');
    });
  });

  describe('planTurn — direct response', () => {
    it('returns direct response for greetings', async () => {
      const deps = makeDeps({
        actions: [],
        reasoning: 'User is greeting, no tool needed',
        directResponse: true,
        needsClarification: false,
        clarificationQuestion: null,
        confidence: 0.99,
      });

      const result = await planTurn(
        makeInput({ userMessage: 'Hello!' }),
        deps,
      );

      expect(result.success).toBe(true);
      expect(result.data!.directResponse).toBe(true);
      expect(result.data!.actions).toEqual([]);
      expect(result.summary).toContain('Direct response');
    });
  });

  describe('planTurn — clarification', () => {
    it('returns clarification when intent is unclear', async () => {
      const deps = makeDeps({
        actions: [],
        reasoning: 'Cannot determine what the user wants',
        directResponse: false,
        needsClarification: true,
        clarificationQuestion: 'Could you tell me more about what you are looking for?',
        confidence: 0.3,
      });

      const result = await planTurn(
        makeInput({ userMessage: 'asdfghjkl' }),
        deps,
      );

      expect(result.success).toBe(true);
      expect(result.data!.needsClarification).toBe(true);
      expect(result.data!.clarificationQuestion).toContain('tell me more');
      expect(result.summary).toContain('clarification');
    });
  });

  describe('planTurn — multi-action', () => {
    it('plans sequential actions with dependency', async () => {
      const deps = makeDeps({
        actions: [
          { toolSlug: 'product-search', intent: 'Search for red shoes', hints: '{"query":"red shoes"}', dependsOnPrevious: false },
          { toolSlug: 'add-to-cart', intent: 'Add cheapest to cart', hints: '{}', dependsOnPrevious: true },
        ],
        reasoning: 'User wants to search and add cheapest to cart',
        directResponse: false,
        needsClarification: false,
        clarificationQuestion: null,
        confidence: 0.88,
      });

      const result = await planTurn(makeInput({
        userMessage: 'Search for red shoes and add the cheapest to cart',
      }), deps);

      expect(result.success).toBe(true);
      expect(result.data!.actions).toHaveLength(2);
      expect(result.data!.actions[0].dependsOnPrevious).toBe(false);
      expect(result.data!.actions[1].dependsOnPrevious).toBe(true);
      expect(result.data!.actions[1].toolSlug).toBe('add-to-cart');
    });
  });

  describe('planTurn — hints parsing', () => {
    it('parses valid JSON hints into objects', async () => {
      const deps = makeDeps({
        actions: [
          { toolSlug: 'product-search', intent: 'Search', hints: '{"query":"shoes","maxPrice":50}', dependsOnPrevious: false },
        ],
        reasoning: 'test',
        directResponse: false,
        needsClarification: false,
        clarificationQuestion: null,
        confidence: 0.9,
      });

      const result = await planTurn(makeInput(), deps);
      expect(result.data!.actions[0].hints).toEqual({ query: 'shoes', maxPrice: 50 });
    });

    it('falls back to { _raw: ... } for non-JSON hints', async () => {
      const deps = makeDeps({
        actions: [
          { toolSlug: 'product-search', intent: 'Search', hints: 'just search for shoes', dependsOnPrevious: false },
        ],
        reasoning: 'test',
        directResponse: false,
        needsClarification: false,
        clarificationQuestion: null,
        confidence: 0.9,
      });

      const result = await planTurn(makeInput(), deps);
      expect(result.data!.actions[0].hints).toEqual({ _raw: 'just search for shoes' });
    });

    it('returns empty hints for empty string', async () => {
      const deps = makeDeps({
        actions: [
          { toolSlug: 'product-search', intent: 'Search', hints: '', dependsOnPrevious: false },
        ],
        reasoning: 'test',
        directResponse: false,
        needsClarification: false,
        clarificationQuestion: null,
        confidence: 0.9,
      });

      const result = await planTurn(makeInput(), deps);
      expect(result.data!.actions[0].hints).toEqual({});
    });
  });

  describe('planTurn — validation', () => {
    it('rejects plan with unknown tool slug', async () => {
      const deps = makeDeps({
        actions: [
          { toolSlug: 'nonexistent-tool', intent: 'Do something', hints: '{}', dependsOnPrevious: false },
        ],
        reasoning: 'test',
        directResponse: false,
        needsClarification: false,
        clarificationQuestion: null,
        confidence: 0.9,
      });

      const result = await planTurn(makeInput(), deps);
      expect(result.success).toBe(false);
      expect(result.summary).toContain('nonexistent-tool');
    });

    it('auto-corrects directResponse=true to false when actions are non-empty', async () => {
      const deps = makeDeps({
        actions: [
          { toolSlug: 'product-search', intent: 'Search', hints: '{}', dependsOnPrevious: false },
        ],
        reasoning: 'test',
        directResponse: true,
        needsClarification: false,
        clarificationQuestion: null,
        confidence: 0.9,
      });

      // The planner used to reject this combo; now it auto-corrects to
      // directResponse=false and executes the actions, since the model
      // clearly chose to use tools.
      const result = await planTurn(makeInput(), deps);
      expect(result.success).toBe(true);
      expect(result.data?.directResponse).toBe(false);
      expect(result.data?.actions).toHaveLength(1);
    });

    it('rejects plan with needsClarification but no question', async () => {
      const deps = makeDeps({
        actions: [],
        reasoning: 'test',
        directResponse: false,
        needsClarification: true,
        clarificationQuestion: null,
        confidence: 0.3,
      });

      const result = await planTurn(makeInput(), deps);
      expect(result.success).toBe(false);
      expect(result.summary).toContain('clarificationQuestion');
    });

    it('rejects plan with confidence out of range', async () => {
      const deps = makeDeps({
        actions: [],
        reasoning: 'test',
        directResponse: true,
        needsClarification: false,
        clarificationQuestion: null,
        confidence: 1.5,
      });

      const result = await planTurn(makeInput(), deps);
      expect(result.success).toBe(false);
      expect(result.summary).toContain('out of range');
    });
  });

  describe('planTurn — error handling', () => {
    it('returns failure when AI call throws', async () => {
      const deps: TurnPlannerDeps = {
        chat: vi.fn().mockRejectedValue(new Error('API rate limited')),
      };

      const result = await planTurn(makeInput(), deps);
      expect(result.success).toBe(false);
      expect(result.summary).toContain('API rate limited');
    });

    it('returns failure when AI returns invalid JSON', async () => {
      const deps: TurnPlannerDeps = {
        chat: vi.fn().mockResolvedValue({
          message: { role: 'assistant', content: 'not json at all' },
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          finishReason: 'stop',
          metadata: { requestId: '', providerId: '', providerKey: '', modelId: 0, modelKey: '', durationMs: 0 },
        }),
      };

      const result = await planTurn(makeInput(), deps);
      expect(result.success).toBe(false);
      expect(result.summary).toContain('failed');
    });
  });

  describe('planTurn — AI call arguments', () => {
    it('passes correct options to chat function', async () => {
      const chatMock = vi.fn().mockResolvedValue(makeChatResult({
        actions: [],
        reasoning: 'greeting',
        directResponse: true,
        needsClarification: false,
        clarificationQuestion: null,
        confidence: 0.99,
      }));

      await planTurn(makeInput(), { chat: chatMock }, {
        providerId: 'my-provider',
        modelId: 42,
        temperature: 0.2,
        maxTokens: 500,
      });

      expect(chatMock).toHaveBeenCalledOnce();
      const [, options] = chatMock.mock.calls[0];
      expect(options.providerId).toBe('my-provider');
      expect(options.modelId).toBe(42);
      expect(options.temperature).toBe(0.2);
      expect(options.maxTokens).toBe(500);
      expect(options.feature).toBe('turn-planner');
      expect(options.responseFormat).toBeDefined();
      expect(options.responseFormat.type).toBe('json_schema');
    });

    it('includes conversation history as messages', async () => {
      const chatMock = vi.fn().mockResolvedValue(makeChatResult({
        actions: [{ toolSlug: 'product-search', intent: 'Search hats', hints: '{}', dependsOnPrevious: false }],
        reasoning: 'continuing conversation',
        directResponse: false,
        needsClarification: false,
        clarificationQuestion: null,
        confidence: 0.9,
      }));

      await planTurn(makeInput({
        userMessage: 'What about hats?',
        conversationHistory: [
          { role: 'user', content: 'Search for shoes', timestamp: '2026-03-13T10:00:00Z' },
          { role: 'assistant', content: 'I found 12 shoes for you.' },
        ],
      }), { chat: chatMock });

      const [messages] = chatMock.mock.calls[0];
      // system + 2 history + 1 current user = 4
      expect(messages).toHaveLength(4);
      expect(messages[0].role).toBe('system');
      expect(messages[1].content).toBe('Search for shoes');
      expect(messages[2].content).toBe('I found 12 shoes for you.');
      expect(messages[3].role).toBe('user');
      expect(messages[3].content).toContain('What about hats?');
    });
  });

  describe('_buildSystemPrompt', () => {
    it('includes all tool slugs and descriptions', async () => {
      const prompt = await _buildSystemPrompt(makeInput());
      expect(prompt).toContain('product-search');
      expect(prompt).toContain('Search for products');
      expect(prompt).toContain('product-lookup');
      expect(prompt).toContain('add-to-cart');
    });

    it('includes business domain when provided', async () => {
      const prompt = await _buildSystemPrompt(makeInput({ businessDomain: 'E-commerce' }));
      expect(prompt).toContain('E-commerce');
    });

    it('omits business domain section when null', async () => {
      const prompt = await _buildSystemPrompt(makeInput({ businessDomain: null }));
      expect(prompt).not.toContain('Business domain');
    });
  });

  describe('_buildUserPrompt', () => {
    it('includes user message', () => {
      const prompt = _buildUserPrompt(makeInput());
      expect(prompt).toContain('Search for red shoes');
    });

    it('includes session facts when present', () => {
      const prompt = _buildUserPrompt(makeInput({
        sessionFacts: { budget: '$100', color: 'red' },
      }));
      expect(prompt).toContain('budget: $100');
      expect(prompt).toContain('color: red');
    });

    it('includes result memory when present', () => {
      const prompt = _buildUserPrompt(makeInput({
        resultMemoryIndex: [
          { ordinal: 1, toolSlug: 'product-search', resultId: 'prod-1', snapshot: { title: 'Red Shoes', price: '$89' } },
          { ordinal: 2, toolSlug: 'product-search', resultId: 'prod-2', snapshot: { title: 'Blue Shoes', price: '$75' } },
        ],
      }));
      expect(prompt).toContain('Item 1');
      expect(prompt).toContain('Red Shoes');
      expect(prompt).toContain('id=prod-1');
      expect(prompt).toContain('Item 2');
    });

    it('includes episodic memories when present', () => {
      const prompt = _buildUserPrompt(makeInput({
        episodicMemories: ['User prefers red', 'Budget is $100'],
      }));
      expect(prompt).toContain('User prefers red');
      expect(prompt).toContain('Budget is $100');
    });

    it('includes conversation summary when present', () => {
      const prompt = _buildUserPrompt(makeInput({
        conversationSummary: 'User has been looking for shoes under $100',
      }));
      expect(prompt).toContain('User has been looking for shoes under $100');
    });

    it('omits sections that have no data', () => {
      const prompt = _buildUserPrompt(makeInput());
      expect(prompt).not.toContain('Session facts');
      expect(prompt).not.toContain('Currently visible results');
      expect(prompt).not.toContain('Relevant user history');
      expect(prompt).not.toContain('Conversation summary');
    });
  });

  describe('_validatePlan', () => {
    const tools = makeTools();

    it('accepts valid plan with known tools', () => {
      const errors = _validatePlan({
        actions: [{ toolSlug: 'product-search', intent: 'search', hints: {}, dependsOnPrevious: false }],
        reasoning: 'test',
        directResponse: false,
        needsClarification: false,
        clarificationQuestion: null,
        confidence: 0.9,
      }, tools);
      expect(errors).toEqual([]);
    });

    it('accepts valid direct response plan', () => {
      const errors = _validatePlan({
        actions: [],
        reasoning: 'greeting',
        directResponse: true,
        needsClarification: false,
        clarificationQuestion: null,
        confidence: 0.99,
      }, tools);
      expect(errors).toEqual([]);
    });

    it('accepts valid clarification plan', () => {
      const errors = _validatePlan({
        actions: [],
        reasoning: 'unclear',
        directResponse: false,
        needsClarification: true,
        clarificationQuestion: 'What do you mean?',
        confidence: 0.3,
      }, tools);
      expect(errors).toEqual([]);
    });

    it('rejects unknown tool slugs', () => {
      const errors = _validatePlan({
        actions: [{ toolSlug: 'unknown', intent: 'test', hints: {}, dependsOnPrevious: false }],
        reasoning: 'test',
        directResponse: false,
        needsClarification: false,
        clarificationQuestion: null,
        confidence: 0.9,
      }, tools);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('unknown');
    });
  });

  describe('module result metadata', () => {
    it('includes duration', async () => {
      const deps = makeDeps({
        actions: [],
        reasoning: 'test',
        directResponse: true,
        needsClarification: false,
        clarificationQuestion: null,
        confidence: 0.99,
      });

      const result = await planTurn(makeInput(), deps);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
