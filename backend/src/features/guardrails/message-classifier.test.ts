// src/features/guardrails/message-classifier.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classifyMessage, type GuardrailRule, type ClassifyMessageInput } from './message-classifier';
import { TopicGateCache, setGlobalTopicGateCache } from './topic-gate.cache';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('@/features/embedding/embedding.service', () => ({
  embed: vi.fn(),
  embedBatch: vi.fn(),
}));

import { embed } from '@/features/embedding/embedding.service';
const mockEmbed = vi.mocked(embed);

// ============================================================================
// HELPERS
// ============================================================================

function makeVector(x: number, y: number, z: number): number[] {
  const mag = Math.sqrt(x * x + y * y + z * z);
  return mag > 0 ? [x / mag, y / mag, z / mag] : [0, 0, 0];
}

function makeBlocklistRule(terms: string[]): GuardrailRule {
  return {
    id: 'rule-blocklist',
    name: 'Blocklist',
    type: 'blocklist',
    config: { terms },
    action: 'block',
    enabled: true,
    priority: 1,
  };
}

function makeBaseConfig(overrides: Partial<ClassifyMessageInput> = {}): ClassifyMessageInput {
  return {
    guardrailRules: [],
    topicGateRuleConfig: null,
    domainFilterEnabled: false,
    blockMessage: 'Blocked by content policy.',
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('classifyMessage', () => {
  let cache: TopicGateCache;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = new TopicGateCache();
    setGlobalTopicGateCache(cache);
  });

  afterEach(() => {
    cache.dispose();
  });

  // ── Stage 1: Hard-block rules ────────────────────────────────────────

  describe('blocklist rules', () => {
    it('blocks message matching blocklist term', async () => {
      const config = makeBaseConfig({
        guardrailRules: [makeBlocklistRule(['spam', 'scam'])],
      });

      const result = await classifyMessage('exp-1', 'this is a scam message', config);

      expect(result.classification).toBe('blocked');
      expect(result.blockMessage).toBe('Blocked by content policy.');
    });

    it('does not block clean message', async () => {
      const config = makeBaseConfig({
        guardrailRules: [makeBlocklistRule(['spam'])],
      });

      const result = await classifyMessage('exp-1', 'Hello there', config);

      expect(result.classification).toBe('greeting');
    });

    it('blocklist takes priority over greeting', async () => {
      const config = makeBaseConfig({
        guardrailRules: [makeBlocklistRule(['hello'])],
      });

      const result = await classifyMessage('exp-1', 'hello', config);

      expect(result.classification).toBe('blocked');
    });
  });

  // ── Stage 2: Greeting detection ──────────────────────────────────────

  describe('greeting detection', () => {
    it('classifies standalone greeting', async () => {
      const config = makeBaseConfig();

      const result = await classifyMessage('exp-1', 'Hello!', config);

      expect(result.classification).toBe('greeting');
      expect(result.debug.greetingRegexMatched).toBe(true);
    });

    it('does not classify greeting with follow-up question', async () => {
      const config = makeBaseConfig();

      const result = await classifyMessage('exp-1', 'Hello, can you help me find shoes?', config);

      // Without domain filter, falls through to default (domain)
      expect(result.classification).toBe('domain');
      expect(result.debug.greetingRegexMatched).toBe(false);
    });

    it('classifies farewell as greeting', async () => {
      const config = makeBaseConfig();

      const result = await classifyMessage('exp-1', 'Goodbye', config);

      expect(result.classification).toBe('greeting');
    });

    it('classifies thank you as greeting', async () => {
      const config = makeBaseConfig();

      const result = await classifyMessage('exp-1', 'Thank you!', config);

      expect(result.classification).toBe('greeting');
    });
  });

  // ── Stage 3: Domain filter ───────────────────────────────────────────

  describe('domain filter enabled', () => {
    const domainVec = makeVector(1, 0, 0);
    const generalVec = makeVector(0, 1, 0);

    const topicGateConfig = {
      allowedDomains: ['fashion'],
      expandedTerms: ['fashion'],
      termEmbeddings: [domainVec],
      threshold: 0.35,
      generalTerms: ['smalltalk'],
      generalTermEmbeddings: [generalVec],
      generalThreshold: 0.30,
    };

    it('classifies domain message when similar to domain cluster', async () => {
      mockEmbed.mockResolvedValue(makeVector(0.9, 0.1, 0)); // close to domain

      const config = makeBaseConfig({
        domainFilterEnabled: true,
        topicGateRuleConfig: topicGateConfig,
      });

      const result = await classifyMessage('exp-1', 'how to wash denim jeans properly', config);

      expect(result.classification).toBe('domain');
      expect(result.debug.domainFilterEnabled).toBe(true);
      expect(result.debug.domainSimilarity).toBeGreaterThan(0.35);
    });

    it('classifies general message when similar to general cluster', async () => {
      mockEmbed.mockResolvedValue(makeVector(0.05, 0.95, 0)); // close to general

      const config = makeBaseConfig({
        domainFilterEnabled: true,
        topicGateRuleConfig: topicGateConfig,
      });

      const result = await classifyMessage('exp-1', 'how are you doing today friend', config);

      expect(result.classification).toBe('general');
      expect(result.debug.generalSimilarity).toBeGreaterThan(0.30);
    });

    it('classifies off_topic when neither cluster matches', async () => {
      mockEmbed.mockResolvedValue(makeVector(0, 0, 1)); // orthogonal to both

      const config = makeBaseConfig({
        domainFilterEnabled: true,
        topicGateRuleConfig: topicGateConfig,
      });

      const result = await classifyMessage('exp-1', 'what is the meaning of life', config);

      expect(result.classification).toBe('off_topic');
    });

    it('greeting still short-circuits before domain filter', async () => {
      const config = makeBaseConfig({
        domainFilterEnabled: true,
        topicGateRuleConfig: topicGateConfig,
      });

      const result = await classifyMessage('exp-1', 'Hello', config);

      expect(result.classification).toBe('greeting');
      // embed should NOT have been called
      expect(mockEmbed).not.toHaveBeenCalled();
    });
  });

  // ── Stage 4: Domain filter OFF ───────────────────────────────────────

  describe('domain filter disabled', () => {
    it('passes all non-greeting, non-blocked messages to domain', async () => {
      const config = makeBaseConfig({
        domainFilterEnabled: false,
      });

      const result = await classifyMessage('exp-1', 'what is quantum physics', config);

      expect(result.classification).toBe('domain');
      expect(result.debug.domainFilterEnabled).toBe(false);
      // No embedding call since domain filter is off
      expect(mockEmbed).not.toHaveBeenCalled();
    });

    it('still detects greetings even with domain filter off', async () => {
      const config = makeBaseConfig({
        domainFilterEnabled: false,
      });

      const result = await classifyMessage('exp-1', 'Hi there', config);

      expect(result.classification).toBe('greeting');
    });

    it('still blocks via blocklist even with domain filter off', async () => {
      const config = makeBaseConfig({
        guardrailRules: [makeBlocklistRule(['bad-word'])],
        domainFilterEnabled: false,
      });

      const result = await classifyMessage('exp-1', 'this has bad-word in it', config);

      expect(result.classification).toBe('blocked');
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty guardrail rules', async () => {
      const config = makeBaseConfig({
        guardrailRules: [],
      });

      const result = await classifyMessage('exp-1', 'some message here', config);

      expect(result.classification).toBe('domain');
    });

    it('skips disabled rules', async () => {
      const disabledRule: GuardrailRule = {
        ...makeBlocklistRule(['hello']),
        enabled: false,
      };
      const config = makeBaseConfig({
        guardrailRules: [disabledRule],
      });

      const result = await classifyMessage('exp-1', 'hello', config);

      expect(result.classification).toBe('greeting');
    });
  });
});
