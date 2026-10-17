import { describe, it, expect, vi, beforeEach } from 'vitest';

// runChatPipeline is the production entry point. Everything outside the pipeline
// (AI service, sessions, tools, classifier, telemetry) is faked, so these tests
// follow the real wiring from the experience to every AI call in a turn.
const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  classifyMessage: vi.fn(),
  executeTool: vi.fn(),
  getSessionWithWindow: vi.fn(),
  extractMemoriesFromSession: vi.fn(),
  summarizeSession: vi.fn(),
}));

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/features/prompt-templates', () => ({
  resolveTemplate: vi.fn().mockResolvedValue(null),
  renderTemplate: vi.fn((content: string) => content),
}));
vi.mock('@/features/telemetry', async () => {
  const { ATTR } = await vi.importActual<typeof import('@/features/telemetry/attribute-keys')>('@/features/telemetry/attribute-keys');
  const span = { setAttribute: vi.fn(), setAttributes: vi.fn(), addEvent: vi.fn(), recordException: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
  return { ATTR, withSpan: (_options: unknown, fn: (s: typeof span) => unknown) => fn(span) };
});
vi.mock('@/features/search/search.service', () => ({
  withAnalyticsSource: (_source: string, fn: () => unknown) => fn(),
  withExperienceContext: (_experienceId: string, fn: () => unknown) => fn(),
}));
vi.mock('@/features/ai-service/ai-service.service', () => ({ chat: mocks.chat }));
vi.mock('@/features/guardrails/message-classifier', () => ({ classifyMessage: mocks.classifyMessage }));
vi.mock('@/features/tools/tools.executor', () => ({ executeTool: mocks.executeTool }));
vi.mock('@/features/analytics', () => ({ trackToolExecution: vi.fn() }));
vi.mock('@/features/data-source/data-source.service', () => ({ getDataSourceById: vi.fn().mockResolvedValue(null) }));
vi.mock('@/features/sessions/sessions.service', () => ({
  getSessionWithWindow: mocks.getSessionWithWindow,
  createSession: vi.fn().mockResolvedValue({ id: 'session-1' }),
  addMessages: vi.fn().mockResolvedValue(undefined),
  updateSession: vi.fn().mockResolvedValue(undefined),
  shouldSummarize: vi.fn().mockReturnValue(true),
}));
vi.mock('@/features/sessions/summarization.service', () => ({ summarizeSession: mocks.summarizeSession }));
vi.mock('@/features/user-memories/memory-extraction.service', () => ({ extractMemoriesFromSession: mocks.extractMemoriesFromSession }));

import { runChatPipeline } from './chat-pipeline';

import type { AIExperienceWithTools } from '@/features/ai-experience/ai-experience.types';
import type { ChatResult } from '@/features/ai-service/ai-service.types';

// ============================================================================
// FIXTURES
// ============================================================================

const EXPERIENCE_MODEL = { providerId: 'p1', modelId: 1 };

function makeExperience(guardrailConfig: unknown = null): AIExperienceWithTools {
  return {
    id: 'exp-1',
    slug: 'test-exp',
    ...EXPERIENCE_MODEL,
    pipelineMode: 'deterministic',
    executionPolicy: null,
    guardrailConfig,
    personaConfig: {
      systemInstructions: 'Be helpful.',
      businessDomains: ['E-commerce'],
      tone: 'friendly',
      name: 'TestBot',
      responseFormats: { enabledPresets: ['rich_text', 'item_grid'], defaultPreset: 'rich_text' },
    },
    sessionConfig: { maxContextMessages: 6 },
    mcpConnections: [],
    tools: [{
      isEnabled: true,
      overrideAiDescription: null,
      tool: {
        id: 'tool-1',
        name: 'product-search',
        slug: 'product-search',
        executorType: 'data_source',
        operation: 'search',
        aiDescription: 'Search for products',
        inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search query' } }, required: ['query'] },
        isActive: true,
        dataSourceId: 'ds-1',
        displayConfig: null,
      },
    }],
  } as unknown as AIExperienceWithTools;
}

/** An input guardrail that runs the classifier. */
const GUARDRAIL_ON = {
  inputGuardrail: { enabled: true, rules: [{ type: 'blocklist', enabled: true, config: { terms: [] } }] },
};

function chatResult(content: string): ChatResult {
  return {
    message: { role: 'assistant', content },
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    finishReason: 'stop',
    metadata: { requestId: 'r1', providerId: 'p1', providerKey: 'openai', modelId: 1, modelKey: 'gpt-4o', durationMs: 200 },
  };
}

/** The model's replies for a turn that plans one search, extracts its query and answers. */
function scriptSearchTurn() {
  mocks.chat
    .mockResolvedValueOnce(chatResult(JSON.stringify({
      actions: [{ toolSlug: 'product-search', intent: 'Search for red shoes', hints: '{"query":"red shoes"}', dependsOnPrevious: false }],
      reasoning: 'User wants to search',
      directResponse: false,
      needsClarification: false,
      clarificationQuestion: null,
      confidence: 0.95,
    })))
    .mockResolvedValueOnce(chatResult(JSON.stringify({ query: 'red shoes' })))
    .mockResolvedValueOnce(chatResult('I found some red shoes for you!'));
  mocks.executeTool.mockResolvedValue({ success: true, data: [{ id: 'p1', title: 'Red Shoes', price: 89 }], resultCount: 1 });
}

function chatOptions() {
  return mocks.chat.mock.calls.map(([, options]) => options);
}

// ============================================================================
// TESTS
// ============================================================================

describe('runChatPipeline model choice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chat.mockReset();
    mocks.getSessionWithWindow.mockResolvedValue(null);
    mocks.extractMemoriesFromSession.mockResolvedValue({ stored: 0, extracted: 0 });
    mocks.summarizeSession.mockResolvedValue({ performed: false });
  });

  it("uses the experience's model to plan, fill in the search and answer", async () => {
    scriptSearchTurn();

    const result = await runChatPipeline({ experience: makeExperience(), message: 'Search for red shoes', onEvent: vi.fn() });

    expect(result.responseText).toBe('I found some red shoes for you!');
    expect(chatOptions().map((o) => o?.feature)).toEqual(['turn-planner', 'param-extraction', 'response-synthesis']);
    for (const options of chatOptions()) {
      expect(options).toMatchObject(EXPERIENCE_MODEL);
    }
  });

  it("uses the experience's model for memory extraction and the conversation summary after the turn", async () => {
    // A known visitor, so memory extraction runs; shouldSummarize is mocked to say yes.
    mocks.getSessionWithWindow.mockResolvedValue({
      session: { id: 'session-1', status: 'active', userContext: { userId: 'user-1' }, messageCount: 40 },
      messages: [],
    });
    scriptSearchTurn();

    await runChatPipeline({ experience: makeExperience(), message: 'Search for red shoes', sessionId: 'session-1', onEvent: vi.fn() });

    // Both run after the turn returns, without being awaited.
    await vi.waitFor(() => {
      expect(mocks.extractMemoriesFromSession).toHaveBeenCalledWith('session-1', 'user-1', 'exp-1', EXPERIENCE_MODEL);
      expect(mocks.summarizeSession).toHaveBeenCalledWith('session-1', 6, EXPERIENCE_MODEL);
    });
  });

  it.each(['greeting', 'general', 'off_topic'] as const)(
    "uses the experience's model for the short reply when a message is classified %s",
    async (classification) => {
      mocks.classifyMessage.mockResolvedValue({
        classification,
        debug: { greetingRegexMatched: classification === 'greeting', domainFilterEnabled: false },
      });
      mocks.chat.mockResolvedValueOnce(chatResult('Hi! How can I help?'));

      const result = await runChatPipeline({ experience: makeExperience(GUARDRAIL_ON), message: 'hi', onEvent: vi.fn() });

      expect(result.responseText).toBe('Hi! How can I help?');
      expect(chatOptions()).toEqual([expect.objectContaining({ feature: 'lightweight-synthesis', ...EXPERIENCE_MODEL })]);
    },
  );
});
