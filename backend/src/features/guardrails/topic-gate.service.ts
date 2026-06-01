// src/features/guardrails/topic-gate.service.ts

/**
 * Topic Gate Service — Dual-Cluster Embedding Classification
 *
 * Two phases:
 *
 * SETUP (one-time, on experience config save):
 *   User keywords → AI expands into 20-30 domain terms + 15-20 general terms
 *   → embedBatch both clusters → store in rule config JSON
 *
 * RUNTIME (every message, via message-classifier):
 *   Cache lookup → embed user message → compare against both clusters
 *   → classify as domain | general | off_topic
 *
 * The greeting detector runs before this (regex, ~0ms).
 * This service only handles embedding-based classification.
 */

import { createLogger } from '@/shared/logger/logger';
import { embed, embedBatch } from '@/features/embedding/embedding.service';
import { maxCosineSimilarity } from '@/features/embedding/vector-math';
import { getGlobalTopicGateCache } from './topic-gate.cache';
import type { DualClusterEvaluationResult } from './message-classification.types';
import type { ChatFn } from '@/features/pipeline/v2/turn-planner';

const logger = createLogger('topic-gate');

// ============================================================================
// TYPES
// ============================================================================

/** Full embedding config stored in the topic_gate rule config JSON. */
export interface TopicGateEmbeddingConfig {
  expandedTerms: string[];
  termEmbeddings: number[][];
  threshold: number;
  generalTerms: string[];
  generalTermEmbeddings: number[][];
  generalThreshold: number;
  lastExpandedAt: string;
}

/** The topic_gate rule config shape as stored in guardrailConfig JSON. */
export interface TopicGateRuleConfig {
  allowedDomains?: string[];
  friendlyMessage?: string;
  domainFilterEnabled?: boolean;
  // Domain cluster
  expandedTerms?: string[];
  termEmbeddings?: number[][];
  threshold?: number;
  // General cluster
  generalTerms?: string[];
  generalTermEmbeddings?: number[][];
  generalThreshold?: number;
  lastExpandedAt?: string;
}

// ============================================================================
// DEFAULTS
// ============================================================================

const DEFAULT_DOMAIN_THRESHOLD = 0.27;
const DEFAULT_GENERAL_THRESHOLD = 0.40;
const DEFAULT_FRIENDLY_MESSAGE =
  "I'm sorry, that's outside my area of expertise. I can only help with topics related to our products and services.";

// ============================================================================
// PARSE HELPERS
// ============================================================================

/**
 * Pull a string[] out of an LLM JSON response that *should* match
 * `{ terms: string[] }` but might not — Ollama (and other local models)
 * don't enforce json_schema strictly, so the model occasionally returns a
 * bare array, a different key name, or fenced markdown. Returns [] on any
 * unrecoverable shape rather than throwing, so a flaky LLM response
 * downgrades term expansion to "skip" instead of crashing the save path.
 */
function parseTermsResponse(content: string): string[] {
  let raw: unknown;
  try {
    // Strip ```json ... ``` fences if present
    const cleaned = content.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    raw = JSON.parse(cleaned);
  } catch {
    logger.warn('parseTermsResponse: content was not valid JSON', { sample: content.slice(0, 200) });
    return [];
  }

  // Direct array
  if (Array.isArray(raw)) {
    return raw.filter((t): t is string => typeof t === 'string');
  }

  // Object — look for `terms` first, then any array-valued property
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const candidate = Array.isArray(obj.terms)
      ? obj.terms
      : Object.values(obj).find((v) => Array.isArray(v));
    if (Array.isArray(candidate)) {
      return candidate.filter((t): t is string => typeof t === 'string');
    }
  }

  logger.warn('parseTermsResponse: no string[] found in response', { keys: raw && typeof raw === 'object' ? Object.keys(raw) : typeof raw });
  return [];
}

// ============================================================================
// SETUP: DOMAIN EXPANSION + EMBEDDING
// ============================================================================

/**
 * Expand user-provided domain keywords into diverse semantic terms using AI.
 * Returns 20-30 terms that cover the domain broadly.
 */
export async function expandDomainKeywords(
  allowedDomains: string[],
  chatFn: ChatFn,
): Promise<string[]> {
  const domainsStr = allowedDomains.join(', ');

  const result = await chatFn(
    [
      {
        role: 'system',
        content: `You generate search terms for a semantic topic classifier that uses cosine similarity on text embeddings. Your terms will be embedded and compared against user messages to decide if a message is within the business domain.

Given business domain keywords, produce EXACTLY 40 diverse terms and short phrases that a customer might realistically type when asking about those domains.

EXPAND coverage to what real users actually type. When a seed is a specific named entity — a brand, product line, proper noun, or rank/tier name — weave it into natural queries rather than discarding it (e.g. for a product-name seed, produce phrasings like "what is [name]" or "[name] vs alternatives"; for a named tier or level, produce "requirements to reach [tier]"). Don't just echo bare seed words back; build realistic queries around them, and also cover related concepts the seeds imply.

Guidelines for HIGH-QUALITY embedding-friendly terms:
- Each term should be a natural question fragment or phrase (3-8 words) that a real user would type in a chat
- Cover the FULL breadth of the domain including edge cases
- Include HOW-TO and care/maintenance questions (e.g. "how to clean suede shoes", "washing instructions for silk", "remove oil stain from cotton")
- Include comparison and recommendation queries (e.g. "best running shoes for flat feet", "which fabric is most durable")
- Include problem-solving queries (e.g. "fix broken zipper on jacket", "shoe sole coming apart")
- Include sizing, fit, and purchasing questions (e.g. "how to measure waist size", "exchange policy for wrong size")
- Include lifestyle, trends, and seasonal topics (e.g. "summer outfit ideas", "what to wear to a wedding")
- Avoid single words or two-word generic phrases — they match too broadly in embedding space
- Each term must be semantically DISTINCT from every other term

You MUST return exactly 40 terms. Return a JSON array of strings.`,
      },
      {
        role: 'user',
        content: `Generate 40 search terms for a customer-facing chatbot. The business covers: ${domainsStr}`,
      },
    ],
    {
      temperature: 0.4,
      maxTokens: 1200,
      responseFormat: {
        type: 'json_schema',
        json_schema: {
          name: 'domain_terms',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              terms: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['terms'],
            additionalProperties: false,
          },
        },
      },
      feature: 'topic-gate-expansion',
    },
  );

  const content =
    typeof result.message.content === 'string' ? result.message.content : '';
  const terms = parseTermsResponse(content);

  // Embed the original seeds too — so specific names (product lines, rank tiers) are
  // matched directly — alongside the AI-expanded phrasings.
  const allTerms = [...new Set([...allowedDomains, ...terms])];

  logger.info('Expanded domain keywords', {
    inputDomains: allowedDomains.length,
    expandedTerms: allTerms.length,
  });

  return allTerms;
}

/**
 * Generate general/conversational terms for the general cluster.
 * These represent common smalltalk, meta questions, and conversational exchanges
 * that are domain-neutral and should not be treated as off-topic.
 */
export async function expandGeneralKeywords(chatFn: ChatFn): Promise<string[]> {
  const result = await chatFn(
    [
      {
        role: 'system',
        content: `You generate search terms for a conversational intent classifier that uses cosine similarity on text embeddings. These terms represent general, non-domain-specific messages that a chatbot user might send.

Produce 20-25 diverse terms and short phrases covering:
- Smalltalk and pleasantries ("how are you doing today", "nice weather")
- Meta questions about the bot ("what can you help me with", "are you a real person")
- Gratitude and feedback ("thanks that was helpful", "great answer")
- Clarification requests ("can you explain that differently", "I don't understand")
- General conversational phrases ("tell me more about that", "that's interesting")
- Farewell and closing ("goodbye for now", "that's all I needed")
- Navigation and help ("go back to main menu", "show me options")

Each term should be 3-7 words — natural phrases a user would type. Avoid single words.
Return a JSON array of strings.`,
      },
      {
        role: 'user',
        content: 'Generate general conversational search terms for a customer-facing chatbot.',
      },
    ],
    {
      temperature: 0.4,
      maxTokens: 500,
      responseFormat: {
        type: 'json_schema',
        json_schema: {
          name: 'general_terms',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              terms: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['terms'],
            additionalProperties: false,
          },
        },
      },
      feature: 'topic-gate-general-expansion',
    },
  );

  const content =
    typeof result.message.content === 'string' ? result.message.content : '';
  const terms = parseTermsResponse(content);

  logger.info('Expanded general keywords', { terms: terms.length });

  return terms;
}

/**
 * Full setup: expand domain + general keywords, generate embeddings for both clusters.
 * Called on experience config save when topic_gate rule has allowedDomains.
 */
export async function setupTopicGateEmbeddings(
  allowedDomains: string[],
  chatFn?: ChatFn,
): Promise<TopicGateEmbeddingConfig> {
  // 1. Get a chat function (use provided or import production one)
  const chat =
    chatFn ??
    (async (messages: Parameters<ChatFn>[0], options: Parameters<ChatFn>[1]) => {
      const { chat: aiChat } = await import(
        '@/features/ai-service/ai-service.service'
      );
      return aiChat(messages, options);
    });

  // 2. Expand domain keywords
  const expandedTerms = await expandDomainKeywords(allowedDomains, chat);

  // 3. Expand general keywords
  const generalTerms = await expandGeneralKeywords(chat);

  // 4. Embed all terms (both clusters in a single batch for efficiency)
  const allTerms = [...expandedTerms, ...generalTerms];
  const allVectors = await embedBatch(allTerms);

  // 5. Split vectors back into domain and general, filtering out failures
  const domainVectors = allVectors.slice(0, expandedTerms.length);
  const generalVectors = allVectors.slice(expandedTerms.length);

  const validDomainTerms: string[] = [];
  const validDomainEmbeddings: number[][] = [];
  for (let i = 0; i < expandedTerms.length; i++) {
    if (domainVectors[i] !== null) {
      validDomainTerms.push(expandedTerms[i]);
      validDomainEmbeddings.push(domainVectors[i]!);
    }
  }

  const validGeneralTerms: string[] = [];
  const validGeneralEmbeddings: number[][] = [];
  for (let i = 0; i < generalTerms.length; i++) {
    if (generalVectors[i] !== null) {
      validGeneralTerms.push(generalTerms[i]);
      validGeneralEmbeddings.push(generalVectors[i]!);
    }
  }

  logger.info('Setup topic gate embeddings (dual cluster)', {
    domainTerms: validDomainTerms.length,
    generalTerms: validGeneralTerms.length,
  });

  return {
    expandedTerms: validDomainTerms,
    termEmbeddings: validDomainEmbeddings,
    threshold: DEFAULT_DOMAIN_THRESHOLD,
    generalTerms: validGeneralTerms,
    generalTermEmbeddings: validGeneralEmbeddings,
    generalThreshold: DEFAULT_GENERAL_THRESHOLD,
    lastExpandedAt: new Date().toISOString(),
  };
}

// ============================================================================
// RUNTIME: DUAL-CLUSTER EVALUATION
// ============================================================================

/**
 * Evaluate a user message against both domain and general embedding clusters.
 *
 * Flow:
 * 1. Check cache for embeddings (populate from rule config on miss)
 * 2. Embed user message
 * 3. Compare against domain cluster → if above threshold → 'domain'
 * 4. Compare against general cluster → if above threshold → 'general'
 * 5. Neither → 'off_topic'
 *
 * Domain takes priority over general (if both match, it's domain).
 * Fail-open: if anything fails, classify as 'domain' (safest default).
 */
export async function evaluateDualCluster(
  experienceId: string,
  userMessage: string,
  ruleConfig: TopicGateRuleConfig,
): Promise<DualClusterEvaluationResult> {
  const domainThreshold = ruleConfig.threshold ?? DEFAULT_DOMAIN_THRESHOLD;
  const generalThreshold = ruleConfig.generalThreshold ?? DEFAULT_GENERAL_THRESHOLD;

  // Default: domain (fail-open — let the planner handle it)
  const failOpenResult: DualClusterEvaluationResult = {
    classification: 'domain',
    domainSimilarity: 1,
    generalSimilarity: 0,
    closestDomainTerm: '',
    closestGeneralTerm: '',
  };

  // Check if domain embeddings are available
  if (
    !ruleConfig.termEmbeddings ||
    !ruleConfig.expandedTerms ||
    ruleConfig.termEmbeddings.length === 0
  ) {
    logger.warn('Dual cluster has no domain embeddings, classifying as domain (fail-open)', {
      experienceId,
    });
    return failOpenResult;
  }

  try {
    // 1. Get cached entry or populate from config
    const cache = getGlobalTopicGateCache();
    let entry = cache.get(experienceId);

    if (!entry) {
      cache.set(experienceId, {
        termEmbeddings: ruleConfig.termEmbeddings,
        expandedTerms: ruleConfig.expandedTerms,
        friendlyMessage: ruleConfig.friendlyMessage ?? DEFAULT_FRIENDLY_MESSAGE,
        threshold: domainThreshold,
        generalTermEmbeddings: ruleConfig.generalTermEmbeddings ?? [],
        generalTerms: ruleConfig.generalTerms ?? [],
        generalThreshold,
      });
      entry = cache.get(experienceId)!;
    }

    // 2. Embed user message
    const messageVector = await embed(userMessage);
    if (!messageVector) {
      logger.warn('Failed to embed user message, classifying as domain (fail-open)', {
        experienceId,
      });
      return failOpenResult;
    }

    // 3. Compare against domain cluster
    const domain = maxCosineSimilarity(messageVector, entry.termEmbeddings);
    const closestDomainTerm =
      domain.bestIndex >= 0 ? entry.expandedTerms[domain.bestIndex] : '';

    // 4. Compare against general cluster (if available)
    let general = { maxSimilarity: 0, bestIndex: -1 };
    let closestGeneralTerm = '';
    if (entry.generalTermEmbeddings.length > 0) {
      general = maxCosineSimilarity(messageVector, entry.generalTermEmbeddings);
      closestGeneralTerm =
        general.bestIndex >= 0 ? entry.generalTerms[general.bestIndex] : '';
    }

    // 5. Classify: domain takes priority
    let classification: DualClusterEvaluationResult['classification'];
    if (domain.maxSimilarity >= domainThreshold) {
      classification = 'domain';
    } else if (general.maxSimilarity >= generalThreshold) {
      classification = 'general';
    } else {
      classification = 'off_topic';
    }

    logger.info('Dual cluster evaluation', {
      experienceId,
      classification,
      domainSimilarity: Math.round(domain.maxSimilarity * 1000) / 1000,
      generalSimilarity: Math.round(general.maxSimilarity * 1000) / 1000,
      closestDomainTerm,
      closestGeneralTerm,
      domainThreshold,
      generalThreshold,
    });

    return {
      classification,
      domainSimilarity: domain.maxSimilarity,
      generalSimilarity: general.maxSimilarity,
      closestDomainTerm,
      closestGeneralTerm,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Dual cluster evaluation failed, classifying as domain (fail-open)', err, {
      experienceId,
    });
    return failOpenResult;
  }
}
