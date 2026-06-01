import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// resolveTemplate() queries the DB for a prompt template; unit tests are
// DB-free, so force the deterministic inline-prompt fallback (null template).
// Without this the postgres client hangs on connect in CI and the test times out.
vi.mock('@/features/prompt-templates', () => ({
  resolveTemplate: vi.fn().mockResolvedValue(null),
  renderTemplate: vi.fn((content: string) => content),
}));

import {
  extractParameters,
  _sanitizeSchemaForStrict,
  _makeNullable,
  _buildSystemPrompt,
  _buildUserPrompt,
} from './param-extraction';
import type { ParamExtractionDeps } from './param-extraction';
import type { ParamExtractionInput } from './v2.types';
import type { ChatResult, ToolParameterSchema } from '@/features/ai-service/ai-service.types';

// ============================================================================
// FIXTURES
// ============================================================================

const SEARCH_SCHEMA: ToolParameterSchema = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Search query' },
    maxPrice: { type: 'number', description: 'Maximum price filter' },
    category: { type: 'string', description: 'Product category', enum: ['Electronics', 'Clothing', 'Shoes'] },
  },
  required: ['query'],
};

function makeInput(overrides: Partial<ParamExtractionInput> = {}): ParamExtractionInput {
  return {
    userMessage: 'Search for red shoes under $50',
    action: {
      toolSlug: 'product-search',
      intent: 'Search for red shoes under $50',
      hints: { query: 'red shoes', maxPrice: 50 },
      dependsOnPrevious: false,
    },
    toolInputSchema: SEARCH_SCHEMA,
    resultMemoryIndex: [],
    previousActionResults: undefined,
    validationErrors: undefined,
    ...overrides,
  };
}

function makeChatResult(params: Record<string, unknown>): ChatResult {
  return {
    message: { role: 'assistant', content: JSON.stringify(params) },
    usage: { inputTokens: 200, outputTokens: 50, totalTokens: 250 },
    finishReason: 'stop',
    metadata: { requestId: 'r1', providerId: 'p1', providerKey: 'openai', modelId: 1, modelKey: 'gpt-4o-mini', durationMs: 200 },
  };
}

function makeDeps(params: Record<string, unknown>): ParamExtractionDeps {
  return { chat: vi.fn().mockResolvedValue(makeChatResult(params)) };
}

// ============================================================================
// TESTS
// ============================================================================

describe('D2a: Parameter Extraction', () => {
  describe('extractParameters — basic extraction', () => {
    it('extracts parameters for a search tool', async () => {
      const deps = makeDeps({ query: 'red shoes', maxPrice: 50, category: 'Shoes' });
      const result = await extractParameters(makeInput(), deps);

      expect(result.success).toBe(true);
      expect(result.data!.parameters).toEqual({ query: 'red shoes', maxPrice: 50, category: 'Shoes' });
      expect(result.summary).toContain('product-search');
    });

    it('passes correct options to chat', async () => {
      const chatMock = vi.fn().mockResolvedValue(makeChatResult({ query: 'shoes' }));
      await extractParameters(makeInput(), { chat: chatMock }, {
        providerId: 'cheap-provider',
        modelId: 99,
        temperature: 0.0,
        maxTokens: 300,
      });

      const [, options] = chatMock.mock.calls[0];
      expect(options.providerId).toBe('cheap-provider');
      expect(options.modelId).toBe(99);
      expect(options.temperature).toBe(0.0);
      expect(options.feature).toBe('param-extraction');
      expect(options.responseFormat.type).toBe('json_schema');
    });

    it('uses tool-specific schema name in response format', async () => {
      const chatMock = vi.fn().mockResolvedValue(makeChatResult({ query: 'test' }));
      await extractParameters(makeInput(), { chat: chatMock });

      const [, options] = chatMock.mock.calls[0];
      expect(options.responseFormat.json_schema.name).toBe('extract_product-search');
    });
  });

  describe('extractParameters — with context', () => {
    it('includes result memory in prompt for reference resolution', async () => {
      const chatMock = vi.fn().mockResolvedValue(makeChatResult({ id: 'prod-3' }));
      const input = makeInput({
        userMessage: 'Show me item 3',
        action: {
          toolSlug: 'product-lookup',
          intent: 'Look up item 3',
          hints: { id: 'prod-3' },
          dependsOnPrevious: false,
        },
        toolInputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Product ID' } },
          required: ['id'],
        },
        resultMemoryIndex: [
          { ordinal: 3, toolSlug: 'product-search', resultId: 'prod-3', snapshot: { title: 'Blue Hat', price: '$25' } },
        ],
      });

      await extractParameters(input, { chat: chatMock });

      const [messages] = chatMock.mock.calls[0];
      const userMsg = messages.find((m: any) => m.role === 'user')!.content;
      expect(userMsg).toContain('Item 3');
      expect(userMsg).toContain('id=prod-3');
    });

    it('includes previous action results for dependent actions', async () => {
      const chatMock = vi.fn().mockResolvedValue(makeChatResult({ productId: 'cheapest-id' }));
      const input = makeInput({
        action: {
          toolSlug: 'add-to-cart',
          intent: 'Add cheapest to cart',
          hints: {},
          dependsOnPrevious: true,
        },
        toolInputSchema: {
          type: 'object',
          properties: { productId: { type: 'string', description: 'Product to add' } },
          required: ['productId'],
        },
        previousActionResults: [
          {
            toolSlug: 'product-search',
            toolId: 'tool-1',
            toolName: 'Product Search',
            intent: 'Search for shoes',
            parameters: { query: 'shoes' },
            result: { success: true, data: [], resultCount: 12 },
            durationMs: 500,
          },
        ],
      });

      await extractParameters(input, { chat: chatMock });

      const [messages] = chatMock.mock.calls[0];
      const userMsg = messages.find((m: any) => m.role === 'user')!.content;
      expect(userMsg).toContain('product-search');
      expect(userMsg).toContain('12 results');
    });

    it('includes validation errors on retry', async () => {
      const chatMock = vi.fn().mockResolvedValue(makeChatResult({ query: 'shoes', category: 'Shoes' }));
      const input = makeInput({
        validationErrors: [
          { field: 'category', message: 'must be one of: Electronics, Clothing, Shoes', expected: 'Electronics, Clothing, Shoes', received: 'Footwear' },
        ],
      });

      await extractParameters(input, { chat: chatMock });

      const [messages] = chatMock.mock.calls[0];
      const userMsg = messages.find((m: any) => m.role === 'user')!.content;
      expect(userMsg).toContain('Previous extraction had errors');
      expect(userMsg).toContain('category');
      expect(userMsg).toContain('must be one of');
    });
  });

  describe('extractParameters — error handling', () => {
    it('returns failure when AI call throws', async () => {
      const deps: ParamExtractionDeps = {
        chat: vi.fn().mockRejectedValue(new Error('Timeout')),
      };
      const result = await extractParameters(makeInput(), deps);
      expect(result.success).toBe(false);
      expect(result.summary).toContain('Timeout');
    });

    it('returns failure when AI returns invalid JSON', async () => {
      const deps: ParamExtractionDeps = {
        chat: vi.fn().mockResolvedValue({
          message: { role: 'assistant', content: 'not json' },
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          finishReason: 'stop',
          metadata: { requestId: '', providerId: '', providerKey: '', modelId: 0, modelKey: '', durationMs: 0 },
        }),
      };
      const result = await extractParameters(makeInput(), deps);
      expect(result.success).toBe(false);
    });
  });

  describe('_sanitizeSchemaForStrict', () => {
    it('puts all properties in required array', () => {
      const sanitized = _sanitizeSchemaForStrict(SEARCH_SCHEMA);
      expect(sanitized.required).toEqual(['query', 'maxPrice', 'category']);
    });

    it('sets additionalProperties to false', () => {
      const sanitized = _sanitizeSchemaForStrict(SEARCH_SCHEMA);
      expect(sanitized.additionalProperties).toBe(false);
    });

    it('makes optional fields nullable', () => {
      const sanitized = _sanitizeSchemaForStrict(SEARCH_SCHEMA);
      // maxPrice and category are optional (not in schema.required)
      expect(sanitized.properties.maxPrice).toHaveProperty('type', ['number', 'null']);
      expect(sanitized.properties.category).toHaveProperty('type', ['string', 'null']);
    });

    it('keeps required fields non-nullable', () => {
      const sanitized = _sanitizeSchemaForStrict(SEARCH_SCHEMA);
      expect(sanitized.properties.query).toHaveProperty('type', 'string');
    });

    it('preserves enum values', () => {
      const sanitized = _sanitizeSchemaForStrict(SEARCH_SCHEMA);
      expect((sanitized.properties.category as any).enum).toEqual(['Electronics', 'Clothing', 'Shoes']);
    });

    it('preserves descriptions', () => {
      const sanitized = _sanitizeSchemaForStrict(SEARCH_SCHEMA);
      expect((sanitized.properties.query as any).description).toBe('Search query');
    });

    it('sanitizes nested object properties', () => {
      const schema: ToolParameterSchema = {
        type: 'object',
        properties: {
          filters: {
            type: 'object',
            description: 'Search filters',
            properties: {
              color: { type: 'string', description: 'Color' },
              size: { type: 'number', description: 'Size' },
            },
            required: ['color'],
          },
        },
        required: ['filters'],
      };

      const sanitized = _sanitizeSchemaForStrict(schema);
      const filters = sanitized.properties.filters as any;
      expect(filters.additionalProperties).toBe(false);
      expect(filters.required).toEqual(['color', 'size']);
      // size is optional within filters → nullable
      expect(filters.properties.size.type).toEqual(['number', 'null']);
      // color is required within filters → not nullable
      expect(filters.properties.color.type).toBe('string');
    });

    it('sanitizes array item schemas', () => {
      const schema: ToolParameterSchema = {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            description: 'Product IDs',
            items: { type: 'string', description: 'A product ID' },
          },
        },
        required: ['ids'],
      };

      const sanitized = _sanitizeSchemaForStrict(schema);
      const ids = sanitized.properties.ids as any;
      expect(ids.items).toEqual({ type: 'string', description: 'A product ID' });
    });
  });

  describe('_makeNullable', () => {
    it('converts string type to union with null', () => {
      expect(_makeNullable({ type: 'string' })).toEqual({ type: ['string', 'null'] });
    });

    it('converts number type to union with null', () => {
      expect(_makeNullable({ type: 'number' })).toEqual({ type: ['number', 'null'] });
    });

    it('does not double-add null to existing union', () => {
      expect(_makeNullable({ type: ['string', 'null'] })).toEqual({ type: ['string', 'null'] });
    });

    it('adds null to union that does not have it', () => {
      expect(_makeNullable({ type: ['string', 'number'] })).toEqual({ type: ['string', 'number', 'null'] });
    });

    it('preserves other properties', () => {
      expect(_makeNullable({ type: 'string', description: 'test', enum: ['a'] }))
        .toEqual({ type: ['string', 'null'], description: 'test', enum: ['a'] });
    });
  });

  describe('_buildSystemPrompt', () => {
    it('includes tool slug', async () => {
      const prompt = await _buildSystemPrompt(makeInput());
      expect(prompt).toContain('product-search');
    });

    it('lists field names and types', async () => {
      const prompt = await _buildSystemPrompt(makeInput());
      expect(prompt).toContain('query');
      expect(prompt).toContain('string');
      expect(prompt).toContain('maxPrice');
      expect(prompt).toContain('number');
    });

    it('lists enum values', async () => {
      const prompt = await _buildSystemPrompt(makeInput());
      expect(prompt).toContain('Electronics');
      expect(prompt).toContain('Clothing');
      expect(prompt).toContain('Shoes');
    });

    it('lists required fields', async () => {
      const prompt = await _buildSystemPrompt(makeInput());
      expect(prompt).toContain('Required: query');
    });
  });

  describe('_buildUserPrompt', () => {
    it('includes message and intent', () => {
      const prompt = _buildUserPrompt(makeInput());
      expect(prompt).toContain('Search for red shoes under $50');
      expect(prompt).toContain('Intent:');
    });

    it('includes hints when present', () => {
      const prompt = _buildUserPrompt(makeInput());
      expect(prompt).toContain('Hints:');
      expect(prompt).toContain('red shoes');
    });

    it('omits hints section when empty', () => {
      const prompt = _buildUserPrompt(makeInput({
        action: { toolSlug: 'x', intent: 'y', hints: {}, dependsOnPrevious: false },
      }));
      expect(prompt).not.toContain('Hints:');
    });
  });

  describe('module result metadata', () => {
    it('includes duration', async () => {
      const result = await extractParameters(makeInput(), makeDeps({ query: 'shoes' }));
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
