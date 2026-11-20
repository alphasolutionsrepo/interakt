// src/features/guardrails/output-guardrail.ts

/**
 * Output safety rules: blocklist, max length and regex filters applied to
 * AI-written text. Called before the text is streamed, saved or traced.
 */

import { ruleMatches } from './rule-match';

import type { GuardrailConfig, GuardrailRule } from '@/db/schema';
import { guardrailDecision } from '@/features/ai-experience/execution-policy';

export const DEFAULT_OUTPUT_BLOCK_MESSAGE = 'The response was blocked by content policy.';

export type OutputGuardrailOutcome = 'not_run' | 'passed' | 'blocked' | 'redacted';

export interface OutputGuardrailResult {
  text: string;
  outcome: OutputGuardrailOutcome;
  /** Names (or ids) of the rules that blocked or redacted */
  firedRules: string[];
  forcedByPolicy: boolean;
}

/** Whether the output stage runs for this config (switched on, or locked with rules). */
export function outputGuardrailDecision(config: GuardrailConfig | null | undefined) {
  return guardrailDecision(config?.enforced === true, config?.outputGuardrail);
}

/**
 * Apply the experience's output rules to AI-written text. Returns the text the
 * visitor may see: the block message, the redacted text, or the text unchanged.
 */
export function applyOutputGuardrail(
  config: GuardrailConfig | null | undefined,
  text: string,
): OutputGuardrailResult {
  const decision = outputGuardrailDecision(config);
  if (!decision.run || !text) {
    return { text, outcome: 'not_run', firedRules: [], forcedByPolicy: decision.forcedByPolicy };
  }

  const evaluated = evaluateOutputGuardrailRules(config!.outputGuardrail.rules ?? [], text);
  const base = { firedRules: evaluated.firedRules, forcedByPolicy: decision.forcedByPolicy };
  if (evaluated.blocked) {
    return {
      ...base,
      text: config!.outputGuardrail.onBlock?.message ?? DEFAULT_OUTPUT_BLOCK_MESSAGE,
      outcome: 'blocked',
    };
  }
  if (evaluated.redactedText !== undefined) {
    return { ...base, text: evaluated.redactedText, outcome: 'redacted' };
  }
  return { ...base, text, outcome: 'passed' };
}

/**
 * Evaluate output guardrail rules. Returns block/redact result.
 */
export function evaluateOutputGuardrailRules(
  rules: GuardrailRule[],
  text: string,
): { blocked: boolean; redactedText?: string; firedRules: string[] } {
  const enabledRules = rules
    .filter(r => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  let currentText = text;
  const firedRules: string[] = [];

  for (const rule of enabledRules) {
    if (rule.action === 'block' && ruleMatches(rule, currentText)) {
      firedRules.push(rule.name || rule.id);
      return { blocked: true, firedRules };
    }
    if (rule.action === 'redact') {
      const redacted = tryRedact(rule, currentText);
      if (redacted !== null) {
        currentText = redacted;
        firedRules.push(rule.name || rule.id);
      }
    }
  }

  if (currentText !== text) {
    return { blocked: false, redactedText: currentText, firedRules };
  }
  return { blocked: false, firedRules };
}

function tryRedact(rule: GuardrailRule, text: string): string | null {
  switch (rule.type) {
    case 'max_length': {
      const maxChars = rule.config.maxChars as number | undefined;
      if (!maxChars || text.length <= maxChars) return null;
      return text.slice(0, maxChars) + '...';
    }
    case 'regex_filter': {
      const pattern = rule.config.pattern as string | undefined;
      if (!pattern) return null;
      try {
        const flags = (rule.config.flags as string) ?? 'gi';
        const replacement = (rule.config.replacement as string) ?? '[REDACTED]';
        const regex = new RegExp(pattern, flags);
        if (!regex.test(text)) return null;
        return text.replace(regex, replacement);
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}
