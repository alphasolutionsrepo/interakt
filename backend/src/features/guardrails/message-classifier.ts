// src/features/guardrails/message-classifier.ts

/**
 * Message Classifier — S1 Input Guardrail Orchestrator
 *
 * Runs the classification pipeline in order:
 * 1. Blocklist / regex / max_length  → blocked (static reject, no AI)
 * 2. Greeting regex detector         → greeting (lightweight synthesis)
 * 3. Domain filter (if enabled)      → domain | general | off_topic
 * 4. Default                         → domain (full pipeline)
 *
 * Each stage short-circuits: once classified, later stages are skipped.
 */

import { createLogger } from '@/shared/logger/logger';
import { detectGreeting } from './greeting-detector';
import { evaluateDualCluster } from './topic-gate.service';
import type { TopicGateRuleConfig } from './topic-gate.service';
import type { ClassificationResult } from './message-classification.types';

const logger = createLogger('message-classifier');

// ============================================================================
// TYPES
// ============================================================================

export interface GuardrailRule {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  action: 'block' | 'warn' | 'redact' | 'reroute';
  enabled: boolean;
  priority: number;
}

export interface ClassifyMessageInput {
  /** All guardrail rules (blocklist, regex_filter, max_length, topic_gate) */
  guardrailRules: GuardrailRule[];
  /** Topic gate rule config (extracted from the topic_gate rule, or null) */
  topicGateRuleConfig: TopicGateRuleConfig | null;
  /** Whether domain filtering is enabled (independent toggle) */
  domainFilterEnabled: boolean;
  /** Static block message for hard-blocked content */
  blockMessage: string;
}

// ============================================================================
// BLOCKLIST / REGEX / MAX_LENGTH EVALUATION
// ============================================================================

function evaluateHardBlockRules(rules: GuardrailRule[], message: string): boolean {
  const enabledRules = rules
    .filter((r) => r.enabled && r.type !== 'topic_gate')
    .sort((a, b) => a.priority - b.priority);

  for (const rule of enabledRules) {
    if (evaluateRule(rule, message) && rule.action === 'block') {
      return true;
    }
  }
  return false;
}

function evaluateRule(rule: GuardrailRule, text: string): boolean {
  switch (rule.type) {
    case 'blocklist': {
      const terms = rule.config.terms as string[] | undefined;
      if (!terms?.length) return false;
      const lower = text.toLowerCase();
      return terms.some((t) => lower.includes(t.toLowerCase()));
    }
    case 'max_length': {
      const maxChars = rule.config.maxChars as number | undefined;
      if (!maxChars) return false;
      return text.length > maxChars;
    }
    case 'regex_filter': {
      const pattern = rule.config.pattern as string | undefined;
      if (!pattern) return false;
      try {
        const flags = (rule.config.flags as string) ?? 'i';
        return new RegExp(pattern, flags).test(text);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

// ============================================================================
// CLASSIFY MESSAGE
// ============================================================================

/**
 * Classify a user message through the S1 guardrail pipeline.
 *
 * Returns the classification and debug info for tracing.
 */
export async function classifyMessage(
  experienceId: string,
  message: string,
  config: ClassifyMessageInput,
): Promise<ClassificationResult> {
  // ── Stage 1: Hard-block rules (blocklist, regex, max_length) ───────
  const t0 = performance.now();
  const blocked = evaluateHardBlockRules(config.guardrailRules, message);
  const blocklistCheckMs = performance.now() - t0;

  if (blocked) {
    logger.info('Message blocked by hard-block rule', { experienceId });
    return {
      classification: 'blocked',
      blockMessage: config.blockMessage,
      debug: {
        greetingRegexMatched: false,
        domainFilterEnabled: config.domainFilterEnabled,
        stageTimings: { blocklistCheckMs },
      },
    };
  }

  // ── Stage 2: Greeting regex detector ───────────────────────────────
  const t1 = performance.now();
  const greetingMatched = detectGreeting(message);
  const greetingDetectionMs = performance.now() - t1;

  if (greetingMatched) {
    logger.info('Message classified as greeting', { experienceId });
    return {
      classification: 'greeting',
      debug: {
        greetingRegexMatched: true,
        domainFilterEnabled: config.domainFilterEnabled,
        stageTimings: { blocklistCheckMs, greetingDetectionMs },
      },
    };
  }

  // ── Stage 3: Domain filter (optional) ──────────────────────────────
  if (config.domainFilterEnabled && config.topicGateRuleConfig) {
    const t2 = performance.now();
    const dualResult = await evaluateDualCluster(
      experienceId,
      message,
      config.topicGateRuleConfig,
    );
    const domainFilterMs = performance.now() - t2;

    logger.info('Message classified by domain filter', {
      experienceId,
      classification: dualResult.classification,
    });

    return {
      classification: dualResult.classification,
      debug: {
        greetingRegexMatched: false,
        domainSimilarity: dualResult.domainSimilarity,
        generalSimilarity: dualResult.generalSimilarity,
        closestDomainTerm: dualResult.closestDomainTerm,
        closestGeneralTerm: dualResult.closestGeneralTerm,
        domainFilterEnabled: true,
        stageTimings: { blocklistCheckMs, greetingDetectionMs, domainFilterMs },
      },
    };
  }

  // ── Stage 4: Default — pass through to planner ─────────────────────
  logger.info('Message classified as domain (default pass-through)', { experienceId });
  return {
    classification: 'domain',
    debug: {
      greetingRegexMatched: false,
      domainFilterEnabled: config.domainFilterEnabled,
      stageTimings: { blocklistCheckMs, greetingDetectionMs },
    },
  };
}
