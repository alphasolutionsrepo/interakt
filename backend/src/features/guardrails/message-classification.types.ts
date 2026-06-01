// src/features/guardrails/message-classification.types.ts

/**
 * Message Classification Types
 *
 * Used by the S1 input guardrail to classify user messages and route them
 * to the appropriate handler (full pipeline, lightweight synthesis, or block).
 */

export type MessageClassification = 'domain' | 'general' | 'greeting' | 'off_topic' | 'blocked';

export interface ClassificationResult {
  classification: MessageClassification;
  /** Static block message (only for 'blocked') */
  blockMessage?: string;
  /** Embedding debug info (only when domain filter ran) */
  debug: {
    greetingRegexMatched: boolean;
    domainSimilarity?: number;
    generalSimilarity?: number;
    closestDomainTerm?: string;
    closestGeneralTerm?: string;
    domainFilterEnabled: boolean;
    /** Stage timings in ms for tracing */
    stageTimings?: {
      blocklistCheckMs: number;
      greetingDetectionMs?: number;
      domainFilterMs?: number;
    };
  };
}

/** Dual-cluster evaluation result from the topic gate embedding service. */
export interface DualClusterEvaluationResult {
  classification: 'domain' | 'general' | 'off_topic';
  domainSimilarity: number;
  generalSimilarity: number;
  closestDomainTerm: string;
  closestGeneralTerm: string;
}
