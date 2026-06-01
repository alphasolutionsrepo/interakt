import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { synthesizeResponse, _selectPreset } from './response-synthesis';
import type { SynthesisDeps } from './response-synthesis';
import type { SynthesisInput, ActionResult } from './v2.types';
import type { PipelineStreamEvent } from '../pipeline.types';
import type { ChatResult } from '@/features/ai-service/ai-service.types';
import type { ToolDisplayConfig } from '@/db/schema/tools.schema';

// ============================================================================
// FIXTURES
// ============================================================================

const PRODUCT_DISPLAY_CONFIG: ToolDisplayConfig = {
  fields: [
    { source: 'title', role: 'title', format: 'text', priority: 'primary' },
    { source: 'imageUrl', role: 'image', format: 'image_url', priority: 'primary' },
    { source: 'price', role: 'price', format: 'currency', currency: 'USD', priority: 'primary' },
  ],
  preferredPresets: ['item_grid', 'single_card'],
};

const TEXT_DISPLAY_CONFIG: ToolDisplayConfig = {
  fields: [
    { source: 'title', role: 'title', format: 'text', priority: 'primary' },
    { source: 'description', role: 'description', format: 'text', priority: 'primary' },
  ],
  preferredPresets: ['item_list', 'single_card'],
};

function makeChatResult(text: string): ChatResult {
  return {
    message: { role: 'assistant', content: text },
    usage: { inputTokens: 300, outputTokens: 150, totalTokens: 450 },
    finishReason: 'stop',
    metadata: { requestId: 'r1', providerId: 'p1', providerKey: 'openai', modelId: 1, modelKey: 'gpt-4o', durationMs: 400 },
  };
}

function makeDeps(text = 'Here are your results.'): SynthesisDeps {
  return { chat: vi.fn().mockResolvedValue(makeChatResult(text)) };
}

function makeActionResult(slug: string, overrides: Partial<ActionResult> = {}): ActionResult {
  return {
    toolSlug: slug,
    toolId: `tool-${slug}`,
    toolName: slug,
    intent: `Execute ${slug}`,
    parameters: {},
    result: { success: true, data: [{ id: '1', title: 'Item 1' }], resultCount: 1 },
    durationMs: 300,
    ...overrides,
  };
}

function makeInput(overrides: Partial<SynthesisInput> = {}): SynthesisInput {
  return {
    userMessage: 'Search for red shoes',
    experienceId: 'test-experience-id',
    actionResults: [makeActionResult('product-search', {
      result: {
        success: true,
        data: [
          { id: 'p1', title: 'Red Shoes', price: 89 },
          { id: 'p2', title: 'Blue Shoes', price: 75 },
        ],
        resultCount: 2,
      },
    })],
    remainingActions: [],
    personaConfig: {
      name: 'ShopBot',
      tone: 'friendly',
      systemInstructions: 'You are a helpful shopping assistant.',
      responseFormats: {
        enabledPresets: ['rich_text', 'item_grid', 'single_card', 'item_list'],
        defaultPreset: 'rich_text',
      },
    },
    plan: {
      actions: [{ toolSlug: 'product-search', intent: 'Search for red shoes', hints: {}, dependsOnPrevious: false }],
      reasoning: 'User wants shoes',
      directResponse: false,
      needsClarification: false,
      clarificationQuestion: null,
      confidence: 0.9,
    },
    directResponse: false,
    toolSlugToDisplayConfig: { 'product-search': PRODUCT_DISPLAY_CONFIG },
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('D3: Response Synthesis', () => {
  describe('synthesizeResponse — basic', () => {
    it('synthesizes a response from action results', async () => {
      const emit = vi.fn();
      const result = await synthesizeResponse(makeInput(), makeDeps('Found 2 shoes for you!'), emit);

      expect(result.success).toBe(true);
      expect(result.data!.responseText).toBe('Found 2 shoes for you!');
      expect(result.data!.preset).toBeDefined();
    });

    it('emits content event', async () => {
      const emit = vi.fn();
      await synthesizeResponse(makeInput(), makeDeps('Response text'), emit);

      const contentEvents = emit.mock.calls
        .map(([e]: [PipelineStreamEvent]) => e)
        .filter((e: PipelineStreamEvent) => e.type === 'content');
      expect(contentEvents).toHaveLength(1);
      expect((contentEvents[0] as any).text).toBe('Response text');
    });

    it('emits preset event before content for non-rich_text presets', async () => {
      const emit = vi.fn();
      const input = makeInput({
        actionResults: [makeActionResult('product-search', {
          result: {
            success: true,
            data: [
              { id: 'p1', title: 'Shoes', imageUrl: 'http://img.com/1.jpg' },
              { id: 'p2', title: 'Boots', imageUrl: 'http://img.com/2.jpg' },
            ],
            resultCount: 2,
          },
        })],
      });

      await synthesizeResponse(input, makeDeps(), emit);

      const eventTypes = emit.mock.calls.map(([e]: [PipelineStreamEvent]) => e.type);
      const presetIdx = eventTypes.indexOf('preset');
      const contentIdx = eventTypes.indexOf('content');
      expect(presetIdx).toBeGreaterThanOrEqual(0);
      expect(presetIdx).toBeLessThan(contentIdx);
    });

    it('does NOT emit preset event for rich_text', async () => {
      const emit = vi.fn();
      // Direct response → rich_text, no preset event
      const input = makeInput({ directResponse: true, actionResults: [] });
      await synthesizeResponse(input, makeDeps('Hello!'), emit);

      const presetEvents = emit.mock.calls
        .map(([e]: [PipelineStreamEvent]) => e)
        .filter((e: PipelineStreamEvent) => e.type === 'preset');
      expect(presetEvents).toHaveLength(0);
    });
  });

  describe('synthesizeResponse — direct response', () => {
    it('handles direct response (greeting)', async () => {
      const emit = vi.fn();
      const input = makeInput({
        userMessage: 'Hello!',
        directResponse: true,
        actionResults: [],
      });

      const result = await synthesizeResponse(input, makeDeps('Hi there! How can I help?'), emit);

      expect(result.success).toBe(true);
      expect(result.data!.preset).toBe('rich_text');
      expect(result.data!.responseText).toContain('Hi there');
    });

    it('handles clarification response', async () => {
      const emit = vi.fn();
      const input = makeInput({
        userMessage: 'asdfghjkl',
        directResponse: false,
        actionResults: [],
        clarificationQuestion: 'Could you tell me what you are looking for?',
      });

      const result = await synthesizeResponse(input, makeDeps('I did not quite catch that. Could you tell me what you are looking for?'), emit);
      expect(result.data!.responseText).toContain('tell me what you are looking for');
    });
  });

  describe('synthesizeResponse — remaining actions', () => {
    it('includes suggested actions from remaining unexecuted actions', async () => {
      const emit = vi.fn();
      const input = makeInput({
        remainingActions: [
          { toolSlug: 'add-to-cart', intent: 'Add cheapest to cart', hints: {}, dependsOnPrevious: true },
        ],
      });

      const result = await synthesizeResponse(input, makeDeps('Found shoes. Would you like me to add the cheapest to cart?'), emit);
      expect(result.data!.responseMetadata.suggestedActions).toEqual(['Add cheapest to cart']);
    });
  });

  describe('synthesizeResponse — fallback', () => {
    it('returns fallback when AI call fails', async () => {
      const emit = vi.fn();
      const deps: SynthesisDeps = {
        chat: vi.fn().mockRejectedValue(new Error('AI down')),
      };

      const result = await synthesizeResponse(makeInput(), deps, emit);

      // Should still succeed with fallback
      expect(result.success).toBe(true);
      expect(result.data!.preset).toBe('rich_text');
      expect(result.data!.responseText).toBeTruthy();
    });

    it('fallback for zero results says no results', async () => {
      const emit = vi.fn();
      const deps: SynthesisDeps = {
        chat: vi.fn().mockRejectedValue(new Error('fail')),
      };
      const input = makeInput({
        actionResults: [makeActionResult('product-search', {
          result: { success: true, data: [], resultCount: 0 },
        })],
      });

      const result = await synthesizeResponse(input, deps, emit);
      expect(result.data!.responseText).toContain("didn't find");
    });

    it('fallback for all-failed actions', async () => {
      const emit = vi.fn();
      const deps: SynthesisDeps = {
        chat: vi.fn().mockRejectedValue(new Error('fail')),
      };
      const input = makeInput({
        actionResults: [makeActionResult('product-search', {
          result: { success: false, data: null, error: 'timeout' },
        })],
      });

      const result = await synthesizeResponse(input, deps, emit);
      expect(result.data!.responseText).toContain("wasn't able to complete");
    });
  });

  describe('synthesizeResponse — sources', () => {
    it('extracts sources from successful actions', async () => {
      const emit = vi.fn();
      const input = makeInput({
        actionResults: [
          makeActionResult('product-search'),
          makeActionResult('product-lookup'),
        ],
        toolSlugToDisplayConfig: {
          'product-search': PRODUCT_DISPLAY_CONFIG,
          'product-lookup': PRODUCT_DISPLAY_CONFIG,
        },
      });

      const result = await synthesizeResponse(input, makeDeps(), emit);
      expect(result.data!.responseMetadata.sources).toEqual(['product-search', 'product-lookup']);
    });
  });

  describe('_selectPreset', () => {
    it('returns rich_text for direct response', () => {
      const { preset } = _selectPreset(makeInput({ directResponse: true, actionResults: [] }));
      expect(preset).toBe('rich_text');
    });

    it('returns rich_text when no successful results', () => {
      const { preset } = _selectPreset(makeInput({
        actionResults: [makeActionResult('x', { result: { success: false, data: null } })],
      }));
      expect(preset).toBe('rich_text');
    });

    it('returns rich_text when tool has no displayConfig', () => {
      const { preset } = _selectPreset(makeInput({
        toolSlugToDisplayConfig: {}, // no configs
        actionResults: [makeActionResult('search', {
          result: { success: true, data: [{ id: '1' }], resultCount: 1 },
        })],
      }));
      expect(preset).toBe('rich_text');
    });

    it('returns single_card for 1 result with displayConfig', () => {
      const { preset, presetPayload } = _selectPreset(makeInput({
        actionResults: [makeActionResult('product-search', {
          result: { success: true, data: [{ id: '1', title: 'Product' }], resultCount: 1 },
        })],
      }));
      expect(preset).toBe('single_card');
      expect(presetPayload).toBeDefined();
      expect(presetPayload!.items).toHaveLength(1);
      expect(presetPayload!.displayConfig).toEqual(PRODUCT_DISPLAY_CONFIG);
    });

    it('returns item_grid for 2+ results with displayConfig preferring grid', () => {
      const { preset, presetPayload } = _selectPreset(makeInput({
        actionResults: [makeActionResult('product-search', {
          result: {
            success: true,
            data: [
              { id: '1', imageUrl: 'a.jpg' },
              { id: '2', imageUrl: 'b.jpg' },
            ],
            resultCount: 2,
          },
        })],
      }));
      expect(preset).toBe('item_grid');
      expect(presetPayload!.items).toHaveLength(2);
    });

    it('returns item_list for 2+ results with displayConfig preferring list', () => {
      const { preset } = _selectPreset(makeInput({
        actionResults: [makeActionResult('article-search', {
          result: {
            success: true,
            data: [{ id: '1', title: 'A' }, { id: '2', title: 'B' }],
            resultCount: 2,
          },
        })],
        toolSlugToDisplayConfig: { 'article-search': TEXT_DISPLAY_CONFIG },
      }));
      expect(preset).toBe('item_list');
    });

    it('falls back to rich_text when ideal preset is not enabled', () => {
      const input = makeInput({
        actionResults: [makeActionResult('product-search', {
          result: { success: true, data: [{ id: '1' }], resultCount: 1 },
        })],
        personaConfig: {
          ...makeInput().personaConfig,
          responseFormats: {
            enabledPresets: ['rich_text'], // single_card not enabled
            defaultPreset: 'rich_text',
          },
        },
      });
      const { preset } = _selectPreset(input);
      expect(preset).toBe('rich_text');
    });

    it('falls back to rich_text when multiple visual tool groups exist', () => {
      const { preset } = _selectPreset(makeInput({
        actionResults: [
          makeActionResult('product-search', {
            result: { success: true, data: [{ id: '1' }], resultCount: 1 },
          }),
          makeActionResult('article-search', {
            result: { success: true, data: [{ id: '2' }], resultCount: 1 },
          }),
        ],
        toolSlugToDisplayConfig: {
          'product-search': PRODUCT_DISPLAY_CONFIG,
          'article-search': TEXT_DISPLAY_CONFIG,
        },
      }));
      expect(preset).toBe('rich_text');
    });

    it('merges results when same tool called multiple times', () => {
      const { preset, presetPayload } = _selectPreset(makeInput({
        actionResults: [
          makeActionResult('product-search', {
            result: { success: true, data: [{ id: '1' }], resultCount: 1 },
          }),
          makeActionResult('product-search', {
            result: { success: true, data: [{ id: '2' }], resultCount: 1 },
          }),
        ],
      }));
      expect(preset).toBe('item_grid'); // 2 items, preferred preset is item_grid
      expect(presetPayload!.items).toHaveLength(2);
    });

    it('extracts items from nested results shape', () => {
      const { presetPayload } = _selectPreset(makeInput({
        actionResults: [makeActionResult('product-search', {
          result: {
            success: true,
            data: { results: [{ id: '1', data: { title: 'Shoe', price: 99 } }], totalCount: 1 },
            resultCount: 1,
          },
        })],
      }));
      expect(presetPayload!.items).toHaveLength(1);
      expect(presetPayload!.items[0].fields).toEqual({ title: 'Shoe', price: 99 });
    });
  });

  describe('module result metadata', () => {
    it('includes duration', async () => {
      const result = await synthesizeResponse(makeInput(), makeDeps(), vi.fn());
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('includes summary with preset and length', async () => {
      const result = await synthesizeResponse(makeInput(), makeDeps('Hello'), vi.fn());
      expect(result.summary).toContain('response');
    });
  });
});
