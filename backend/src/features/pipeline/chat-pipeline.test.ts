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
  addMessages: vi.fn(),
  withSpan: vi.fn(),
  setAttribute: vi.fn(),
  applyOutputGuardrail: vi.fn(),
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
  const span = { setAttribute: mocks.setAttribute, setAttributes: vi.fn(), addEvent: vi.fn(), recordException: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
  mocks.withSpan.mockImplementation((_options: unknown, fn: (s: typeof span) => unknown) => fn(span));
  return { ATTR, withSpan: mocks.withSpan };
});
vi.mock('@/features/guardrails/output-guardrail', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/guardrails/output-guardrail')>();
  mocks.applyOutputGuardrail.mockImplementation(actual.applyOutputGuardrail);
  return { ...actual, applyOutputGuardrail: mocks.applyOutputGuardrail };
});
vi.mock('@/features/search/search.service', () => ({
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
  addMessages: mocks.addMessages,
  updateSession: vi.fn().mockResolvedValue(undefined),
  shouldSummarize: vi.fn().mockReturnValue(true),
}));
vi.mock('@/features/sessions/summarization.service', () => ({ summarizeSession: mocks.summarizeSession }));
vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/user-memories/memory-extraction.service', () => ({ extractMemoriesFromSession: mocks.extractMemoriesFromSession }));

import { getAnalyticsSourceContext } from '@/features/analytics/analytics-source-context';

import { runChatPipeline } from './chat-pipeline';

import { featureSwitchesStub } from '@/shared/test/feature-switches-stub';

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
    mocks.addMessages.mockReset().mockResolvedValue(undefined);
    mocks.getSessionWithWindow.mockResolvedValue(null);
    mocks.extractMemoriesFromSession.mockResolvedValue({ stored: 0, extracted: 0 });
    mocks.summarizeSession.mockResolvedValue({ performed: false });
    featureSwitchesStub.reset();
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

  it("runs an admin test chat's model calls and tool runs as admin_test, so they're stored as test traffic", async () => {
    const replies = [
      JSON.stringify({
        actions: [{ toolSlug: 'product-search', intent: 'Search for red shoes', hints: '{"query":"red shoes"}', dependsOnPrevious: false }],
        reasoning: 'User wants to search', directResponse: false, needsClarification: false, clarificationQuestion: null, confidence: 0.95,
      }),
      JSON.stringify({ query: 'red shoes' }),
      'I found some red shoes for you!',
    ];
    const seen: string[] = [];
    mocks.chat.mockImplementation(async () => {
      seen.push(`chat:${getAnalyticsSourceContext()}`);
      return chatResult(replies.shift() ?? 'ok');
    });
    mocks.executeTool.mockImplementation(async () => {
      seen.push(`tool:${getAnalyticsSourceContext()}`);
      return { success: true, data: [{ id: 'p1', title: 'Red Shoes', price: 89 }], resultCount: 1 };
    });

    await runChatPipeline({ experience: makeExperience(), message: 'Search for red shoes', analyticsSource: 'admin_test', onEvent: vi.fn() });

    expect(seen).toEqual(['chat:admin_test', 'chat:admin_test', 'tool:admin_test', 'chat:admin_test']);
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

  it('makes no user memories with Chat turned off (the built-in help still chats)', async () => {
    featureSwitchesStub.off = new Set(['chat']);
    mocks.getSessionWithWindow.mockResolvedValue({
      session: { id: 'session-1', status: 'active', userContext: { userId: 'user-1' }, messageCount: 40 },
      messages: [],
    });
    scriptSearchTurn();

    await runChatPipeline({ experience: makeExperience(), message: 'Search for red shoes', sessionId: 'session-1', onEvent: vi.fn() });

    // The summary still runs after the turn; by then memory extraction would have been called
    await vi.waitFor(() => expect(mocks.summarizeSession).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.extractMemoriesFromSession).not.toHaveBeenCalled();
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

  describe('output safety rules', () => {
    const OUTPUT_BLOCK = {
      inputGuardrail: { enabled: false, rules: [], onBlock: { message: '' } },
      outputGuardrail: {
        enabled: true,
        rules: [{ id: 'r1', name: 'short', type: 'max_length', config: { maxChars: 20 }, action: 'block', enabled: true, priority: 1 }],
        onBlock: { message: 'BLOCKED BY OUTPUT RULE' },
      },
    };

    it('the visitor, the saved message and the result carry only the block message', async () => {
      scriptSearchTurn();
      const onEvent = vi.fn();

      const result = await runChatPipeline({ experience: makeExperience(OUTPUT_BLOCK), message: 'Search for red shoes', onEvent });

      expect(result.responseText).toBe('BLOCKED BY OUTPUT RULE');
      const events = onEvent.mock.calls.map(([e]) => e);
      expect(events.filter((e) => e.type === 'content')).toEqual([{ type: 'content', text: 'BLOCKED BY OUTPUT RULE' }]);
      const saved = mocks.addMessages.mock.calls[0][1];
      expect(saved[1].content).toBe('BLOCKED BY OUTPUT RULE');
      expect(JSON.stringify([events, saved])).not.toContain('red shoes for you');
    });

    const GREETING_GUARDRAIL = {
      ...OUTPUT_BLOCK,
      inputGuardrail: { enabled: true, rules: [{ type: 'blocklist', enabled: true, config: { terms: [] } }], onBlock: { message: '' } },
    };

    it.each(['greeting', 'general', 'off_topic'])('filters the %s reply before it is saved and sent', async (classification) => {
      mocks.classifyMessage.mockResolvedValue({ classification, debug: { greetingRegexMatched: true, domainFilterEnabled: false } });
      mocks.chat.mockResolvedValueOnce(chatResult('Hello there! How can I help you today?'));
      const onEvent = vi.fn();

      const result = await runChatPipeline({ experience: makeExperience(GREETING_GUARDRAIL), message: 'hi', onEvent });

      expect(result.responseText).toBe('BLOCKED BY OUTPUT RULE');
      const events = onEvent.mock.calls.map(([e]) => e);
      expect(events.filter((e) => e.type === 'content')).toEqual([{ type: 'content', text: 'BLOCKED BY OUTPUT RULE' }]);
      expect(mocks.addMessages.mock.calls[0][1][1].content).toBe('BLOCKED BY OUTPUT RULE');
    });

    it('sends the block message, not the raw reply, when the filter throws on a short-circuit reply', async () => {
      mocks.classifyMessage.mockResolvedValue({ classification: 'greeting', debug: { greetingRegexMatched: true, domainFilterEnabled: false } });
      mocks.chat.mockResolvedValueOnce(chatResult('Hello there! How can I help you today?'));
      mocks.applyOutputGuardrail.mockImplementationOnce(() => { throw new Error('filter boom'); });
      const onEvent = vi.fn();

      const result = await runChatPipeline({ experience: makeExperience(GREETING_GUARDRAIL), message: 'hi', onEvent });

      expect(result.responseText).toBe('BLOCKED BY OUTPUT RULE');
      const events = onEvent.mock.calls.map(([e]) => e);
      expect(events.filter((e) => e.type === 'content')).toEqual([{ type: 'content', text: 'BLOCKED BY OUTPUT RULE' }]);
      expect(events.some((e) => e.type === 'done')).toBe(true);
      expect(mocks.addMessages.mock.calls[0][1][1].content).toBe('BLOCKED BY OUTPUT RULE');
      expect(JSON.stringify([events, mocks.addMessages.mock.calls])).not.toContain('Hello there');
    });

    it('redacts a matching answer on a normal turn: the content event and saved message carry the redacted text', async () => {
      scriptSearchTurn();
      const onEvent = vi.fn();
      const experience = makeExperience({
        inputGuardrail: { enabled: false, rules: [], onBlock: { message: '' } },
        outputGuardrail: {
          enabled: true,
          rules: [{ id: 'r2', name: 'shoes', type: 'regex_filter', config: { pattern: 'red shoes', replacement: '[ITEM]' }, action: 'redact', enabled: true, priority: 1 }],
          onBlock: { message: 'unused' },
        },
      });

      const result = await runChatPipeline({ experience, message: 'Search for red shoes', onEvent });

      expect(result.responseText).toBe('I found some [ITEM] for you!');
      const events = onEvent.mock.calls.map(([e]) => e);
      expect(events.filter((e) => e.type === 'content')).toEqual([{ type: 'content', text: 'I found some [ITEM] for you!' }]);
      expect(mocks.addMessages.mock.calls[0][1][1].content).toBe('I found some [ITEM] for you!');
    });

    it('records the outcome and fired rules on the output_guardrail span', async () => {
      scriptSearchTurn();
      await runChatPipeline({ experience: makeExperience(OUTPUT_BLOCK), message: 'Search for red shoes', onEvent: vi.fn() });

      const spanNames = mocks.withSpan.mock.calls.map(([o]) => (o as { name: string }).name);
      expect(spanNames).toContain('pipeline.v2.output_guardrail');
      expect(mocks.setAttribute).toHaveBeenCalledWith('alpha.v2.guardrail.output_outcome', 'blocked');
      expect(mocks.setAttribute).toHaveBeenCalledWith('alpha.v2.guardrail.output_fired_rules', 'short');
    });

    it('records the outcome and fired rules on the output_guardrail span for a greeting short-circuit turn', async () => {
      mocks.classifyMessage.mockResolvedValue({ classification: 'greeting', debug: { greetingRegexMatched: true, domainFilterEnabled: false } });
      mocks.chat.mockResolvedValueOnce(chatResult('Hello there! How can I help you today?'));

      await runChatPipeline({ experience: makeExperience(GREETING_GUARDRAIL), message: 'hi', onEvent: vi.fn() });

      const spanNames = mocks.withSpan.mock.calls.map(([o]) => (o as { name: string }).name);
      expect(spanNames).toContain('pipeline.v2.output_guardrail');
      expect(mocks.setAttribute).toHaveBeenCalledWith('alpha.v2.guardrail.output_outcome', 'blocked');
      expect(mocks.setAttribute).toHaveBeenCalledWith('alpha.v2.guardrail.output_fired_rules', 'short');
    });

    it('makes no output_guardrail span when no output rule is switched on', async () => {
      scriptSearchTurn();
      await runChatPipeline({ experience: makeExperience(), message: 'Search for red shoes', onEvent: vi.fn() });

      const spanNames = mocks.withSpan.mock.calls.map(([o]) => (o as { name: string }).name);
      expect(spanNames).not.toContain('pipeline.v2.output_guardrail');
    });

    it('leaves answers alone when no output rule is switched on', async () => {
      scriptSearchTurn();
      const result = await runChatPipeline({ experience: makeExperience(), message: 'Search for red shoes', onEvent: vi.fn() });
      expect(result.responseText).toBe('I found some red shoes for you!');
    });
  });
});
