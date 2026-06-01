// src/features/guardrails/topic-gate.service.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  expandDomainKeywords,
  expandGeneralKeywords,
  setupTopicGateEmbeddings,
  evaluateDualCluster,
} from './topic-gate.service';
import { TopicGateCache, setGlobalTopicGateCache } from './topic-gate.cache';
import type { ChatFn } from '@/features/pipeline/v2/turn-planner';
import type { ChatResult } from '@/features/ai-service/ai-service.types';

// ============================================================================
// HELPERS
// ============================================================================

function makeChatFn(terms: string[]): ChatFn {
  return vi.fn().mockResolvedValue({
    message: { role: 'assistant', content: JSON.stringify({ terms }) },
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    finishReason: 'stop',
    metadata: {},
  } as ChatResult);
}

/**
 * Chat fn that returns different terms based on call order.
 * First call returns domainTerms, second call returns generalTerms.
 */
function makeDualChatFn(domainTerms: string[], generalTerms: string[]): ChatFn {
  let callCount = 0;
  return vi.fn().mockImplementation(() => {
    const terms = callCount === 0 ? domainTerms : generalTerms;
    callCount++;
    return Promise.resolve({
      message: { role: 'assistant', content: JSON.stringify({ terms }) },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      finishReason: 'stop',
      metadata: {},
    } as ChatResult);
  });
}

/** Generate a simple unit vector for testing (dimension = 3 for speed). */
function makeVector(x: number, y: number, z: number): number[] {
  const mag = Math.sqrt(x * x + y * y + z * z);
  return mag > 0 ? [x / mag, y / mag, z / mag] : [0, 0, 0];
}

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('@/features/embedding/embedding.service', () => ({
  embed: vi.fn(),
  embedBatch: vi.fn(),
}));

import { embed, embedBatch } from '@/features/embedding/embedding.service';
const mockEmbed = vi.mocked(embed);
const mockEmbedBatch = vi.mocked(embedBatch);

// ============================================================================
// TESTS: DOMAIN EXPANSION
// ============================================================================

describe('expandDomainKeywords', () => {
  it('includes original seed domains alongside AI-generated terms (deduplicated)', async () => {
    const chatFn = makeChatFn(['leather boots', 'summer dresses', 'sizing guide']);
    const result = await expandDomainKeywords(['fashion', 'clothing'], chatFn);

    // Seeds are embedded directly so specific names (brands, product lines)
    // match without depending on the AI expansion.
    expect(result).toContain('fashion');
    expect(result).toContain('clothing');
    // AI-generated expansions are also present.
    expect(result).toContain('leather boots');
    expect(result).toContain('summer dresses');
    expect(result).toContain('sizing guide');
    expect(chatFn).toHaveBeenCalledOnce();
  });

  it('deduplicates when AI returns duplicate terms', async () => {
    const chatFn = makeChatFn(['style tips', 'style tips', 'fashion trends']);
    const result = await expandDomainKeywords(['fashion'], chatFn);

    expect(result.filter((t) => t === 'style tips')).toHaveLength(1);
    expect(result).toContain('fashion trends');
  });
});

// ============================================================================
// TESTS: GENERAL EXPANSION
// ============================================================================

describe('expandGeneralKeywords', () => {
  it('returns AI-generated general terms', async () => {
    const chatFn = makeChatFn(['how are you', 'what can you do', 'thank you']);
    const result = await expandGeneralKeywords(chatFn);

    expect(result).toContain('how are you');
    expect(result).toContain('what can you do');
    expect(result).toContain('thank you');
    expect(chatFn).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// TESTS: SETUP (DUAL CLUSTER)
// ============================================================================

describe('setupTopicGateEmbeddings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expands both domain and general keywords and embeds all terms (seeds included)', async () => {
    const chatFn = makeDualChatFn(['term1', 'term2'], ['general1', 'general2']);
    const vec1 = makeVector(1, 0, 0);
    const vec2 = makeVector(0, 1, 0);
    const vec3 = makeVector(0, 0, 1);
    const vec4 = makeVector(1, 1, 0);
    const vec5 = makeVector(0.5, 0.5, 0);

    // embedBatch is one combined call: ['fashion' (seed), 'term1', 'term2',
    // 'general1', 'general2'] → 5 vectors, sliced into domain (0..3) and
    // general (3..) inside the service.
    mockEmbedBatch.mockResolvedValue([vec1, vec2, vec5, vec3, vec4]);

    const config = await setupTopicGateEmbeddings(['fashion'], chatFn);

    expect(config.expandedTerms).toEqual(['fashion', 'term1', 'term2']);
    expect(config.termEmbeddings).toHaveLength(3);
    expect(config.threshold).toBe(0.27);
    expect(config.generalTerms).toEqual(['general1', 'general2']);
    expect(config.generalTermEmbeddings).toHaveLength(2);
    expect(config.generalThreshold).toBe(0.40);
    expect(config.lastExpandedAt).toBeDefined();
  });

  it('filters out terms with failed embeddings from both clusters', async () => {
    const chatFn = makeDualChatFn(['good-term', 'bad-term'], ['good-general']);
    const vec1 = makeVector(1, 0, 0);

    // Combined embedBatch order: ['fashion', 'good-term', 'bad-term', 'good-general']
    // bad-term's embedding fails (null), so it must be dropped.
    mockEmbedBatch.mockResolvedValue([vec1, vec1, null, vec1]);

    const config = await setupTopicGateEmbeddings(['fashion'], chatFn);

    expect(config.expandedTerms).toEqual(['fashion', 'good-term']);
    expect(config.termEmbeddings).toHaveLength(2);
    expect(config.generalTerms).toEqual(['good-general']);
    expect(config.generalTermEmbeddings).toHaveLength(1);
  });
});

// ============================================================================
// TESTS: DUAL-CLUSTER EVALUATION
// ============================================================================

describe('evaluateDualCluster', () => {
  let cache: TopicGateCache;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = new TopicGateCache();
    setGlobalTopicGateCache(cache);
  });

  afterEach(() => {
    cache.dispose();
  });

  it('classifies as domain when similarity exceeds domain threshold', async () => {
    const domainVec = makeVector(1, 0, 0);
    const generalVec = makeVector(0, 0, 1);
    const messageVec = makeVector(0.9, 0.1, 0); // close to domain

    mockEmbed.mockResolvedValue(messageVec);

    const result = await evaluateDualCluster('exp-1', 'how to wash jeans properly', {
      allowedDomains: ['fashion'],
      expandedTerms: ['fashion'],
      termEmbeddings: [domainVec],
      threshold: 0.35,
      generalTerms: ['smalltalk'],
      generalTermEmbeddings: [generalVec],
      generalThreshold: 0.30,
    });

    expect(result.classification).toBe('domain');
    expect(result.domainSimilarity).toBeGreaterThan(0.35);
  });

  it('classifies as general when only general cluster matches', async () => {
    const domainVec = makeVector(1, 0, 0);
    const generalVec = makeVector(0, 1, 0);
    const messageVec = makeVector(0.05, 0.95, 0); // close to general, far from domain

    mockEmbed.mockResolvedValue(messageVec);

    const result = await evaluateDualCluster('exp-1', 'how are you doing today', {
      allowedDomains: ['fashion'],
      expandedTerms: ['fashion'],
      termEmbeddings: [domainVec],
      threshold: 0.35,
      generalTerms: ['how are you'],
      generalTermEmbeddings: [generalVec],
      generalThreshold: 0.30,
    });

    expect(result.classification).toBe('general');
    expect(result.generalSimilarity).toBeGreaterThan(0.30);
    expect(result.domainSimilarity).toBeLessThan(0.35);
  });

  it('classifies as off_topic when neither cluster matches', async () => {
    const domainVec = makeVector(1, 0, 0);
    const generalVec = makeVector(0, 1, 0);
    const messageVec = makeVector(0, 0, 1); // orthogonal to both

    mockEmbed.mockResolvedValue(messageVec);

    const result = await evaluateDualCluster('exp-1', 'what is the meaning of life', {
      allowedDomains: ['fashion'],
      expandedTerms: ['fashion'],
      termEmbeddings: [domainVec],
      threshold: 0.35,
      generalTerms: ['how are you'],
      generalTermEmbeddings: [generalVec],
      generalThreshold: 0.30,
    });

    expect(result.classification).toBe('off_topic');
    expect(result.domainSimilarity).toBeCloseTo(0);
    expect(result.generalSimilarity).toBeCloseTo(0);
  });

  it('domain takes priority when both clusters match', async () => {
    // Both clusters in a similar direction, message close to both
    const domainVec = makeVector(1, 0.5, 0);
    const generalVec = makeVector(0.9, 0.6, 0);
    const messageVec = makeVector(1, 0.5, 0); // identical to domain

    mockEmbed.mockResolvedValue(messageVec);

    const result = await evaluateDualCluster('exp-1', 'help me with product sizing', {
      allowedDomains: ['fashion'],
      expandedTerms: ['fashion'],
      termEmbeddings: [domainVec],
      threshold: 0.35,
      generalTerms: ['help me'],
      generalTermEmbeddings: [generalVec],
      generalThreshold: 0.30,
    });

    expect(result.classification).toBe('domain');
  });

  it('fail-opens as domain when embeddings are missing', async () => {
    const result = await evaluateDualCluster('exp-1', 'hello there friend', {
      allowedDomains: ['fashion'],
      // No expandedTerms or termEmbeddings
    });

    expect(result.classification).toBe('domain');
  });

  it('fail-opens as domain when embed() returns null', async () => {
    mockEmbed.mockResolvedValue(null);

    const result = await evaluateDualCluster('exp-1', 'how to wash jeans properly', {
      allowedDomains: ['fashion'],
      expandedTerms: ['fashion'],
      termEmbeddings: [makeVector(1, 0, 0)],
      threshold: 0.35,
    });

    expect(result.classification).toBe('domain');
  });

  it('uses cached embeddings on second call', async () => {
    const domainVec = makeVector(1, 0, 0);
    const generalVec = makeVector(0, 1, 0);
    const messageVec = makeVector(0.9, 0.1, 0);
    mockEmbed.mockResolvedValue(messageVec);

    const ruleConfig = {
      allowedDomains: ['fashion'],
      expandedTerms: ['fashion'],
      termEmbeddings: [domainVec],
      threshold: 0.35,
      generalTerms: ['smalltalk'],
      generalTermEmbeddings: [generalVec],
      generalThreshold: 0.30,
    };

    // First call — populates cache
    await evaluateDualCluster('exp-1', 'how to wash jeans properly', ruleConfig);
    // Second call — should use cache
    await evaluateDualCluster('exp-1', 'best denim jacket styles', ruleConfig);

    expect(cache.get('exp-1')).not.toBeNull();
    // embed was called twice (once per message), not for the domain/general terms
    expect(mockEmbed).toHaveBeenCalledTimes(2);
  });

  it('works without general cluster (backward compat)', async () => {
    const domainVec = makeVector(1, 0, 0);
    const messageVec = makeVector(0, 1, 0); // orthogonal to domain

    mockEmbed.mockResolvedValue(messageVec);

    const result = await evaluateDualCluster('exp-1', 'what is the meaning of life', {
      allowedDomains: ['fashion'],
      expandedTerms: ['fashion'],
      termEmbeddings: [domainVec],
      threshold: 0.35,
      // No generalTerms — backward compat with existing configs
    });

    // Without general cluster, non-domain goes straight to off_topic
    expect(result.classification).toBe('off_topic');
    expect(result.generalSimilarity).toBe(0);
  });

  it('returns closest terms for debugging', async () => {
    const domainVecs = [makeVector(1, 0, 0), makeVector(0.7, 0.7, 0)];
    const generalVecs = [makeVector(0, 0, 1)];
    const messageVec = makeVector(0.6, 0.8, 0); // closer to 2nd domain vec

    mockEmbed.mockResolvedValue(messageVec);

    const result = await evaluateDualCluster('exp-1', 'where can I find trendy outfits', {
      expandedTerms: ['jeans', 'trendy outfits'],
      termEmbeddings: domainVecs,
      threshold: 0.35,
      generalTerms: ['hello'],
      generalTermEmbeddings: generalVecs,
      generalThreshold: 0.30,
    });

    expect(result.closestDomainTerm).toBe('trendy outfits');
    expect(result.closestGeneralTerm).toBe('hello');
  });
});
