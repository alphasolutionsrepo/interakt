// src/features/pipeline/steps/input-guardrail.ts

/**
 * Input Guardrail Step
 *
 * Evaluates input rules against the user's message before any processing.
 * Rules are defined in the AI Experience's guardrailConfig.inputGuardrail.
 *
 * This is a lightweight evaluation step. The full guardrail rule engine
 * (topic gate, PII detection, LLM judge, etc.) is Phase 2. For now,
 * we support basic rule types: blocklist, max_length, regex_filter.
 */

import type { Span } from '@opentelemetry/api';
import type { StepHandler, PipelineContext, StepResult } from '../pipeline.types';

interface InputGuardrailConfig {
  enabled?: boolean;
  rules?: Array<{
    id: string;
    name: string;
    type: string;
    config: Record<string, unknown>;
    action: 'block' | 'warn' | 'redact' | 'reroute';
    enabled: boolean;
    priority: number;
  }>;
  onBlock?: {
    message: string;
  };
}

interface RuleEvaluation {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  action?: string;
}

export const inputGuardrailHandler: StepHandler = {
  type: 'input_guardrail',

  async execute(
    config: Record<string, unknown>,
    ctx: PipelineContext,
    span: Span,
  ): Promise<StepResult> {
    const guardrail = config as unknown as InputGuardrailConfig;

    if (!guardrail.enabled || !guardrail.rules?.length) {
      return { success: true, summary: 'No input guardrail rules configured' };
    }

    const rules = guardrail.rules
      .filter(r => r.enabled)
      .sort((a, b) => a.priority - b.priority);

    const evaluations: RuleEvaluation[] = [];
    let blocked = false;
    const blockMessage = guardrail.onBlock?.message ?? 'Your message was blocked by content policy.';

    for (const rule of rules) {
      const triggered = evaluateRule(rule, ctx.userMessage);
      evaluations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        triggered,
        action: triggered ? rule.action : undefined,
      });

      if (triggered && rule.action === 'block') {
        blocked = true;
        span.setAttribute('guardrail.blocked_by', rule.id);
        break;
      }
    }

    span.setAttribute('guardrail.rules_evaluated', evaluations.length);
    span.setAttribute('guardrail.triggered_count', evaluations.filter(e => e.triggered).length);

    if (blocked) {
      ctx.responseText = blockMessage;
      ctx.emitEvent({ type: 'content', text: blockMessage });
      return {
        success: true,
        abort: true,
        data: { blocked: true, evaluations },
        summary: `Input blocked by guardrail`,
      };
    }

    return {
      success: true,
      data: { blocked: false, evaluations },
      summary: `Evaluated ${evaluations.length} rules, none blocked`,
    };
  },
};

// ============================================================================
// RULE EVALUATION (Phase 1 — basic types only)
// ============================================================================

function evaluateRule(
  rule: InputGuardrailConfig['rules'][0],
  message: string,
): boolean {
  switch (rule.type) {
    case 'blocklist':
      return evaluateBlocklist(rule.config, message);
    case 'max_length':
      return evaluateMaxLength(rule.config, message);
    case 'regex_filter':
      return evaluateRegexFilter(rule.config, message);
    default:
      // Unknown rule types are skipped (Phase 2 adds topic_gate, pii_detection, llm_judge, etc.)
      return false;
  }
}

function evaluateBlocklist(config: Record<string, unknown>, message: string): boolean {
  const terms = config.terms as string[] | undefined;
  if (!terms?.length) return false;
  const lower = message.toLowerCase();
  return terms.some(term => lower.includes(term.toLowerCase()));
}

function evaluateMaxLength(config: Record<string, unknown>, message: string): boolean {
  const maxChars = config.maxChars as number | undefined;
  if (!maxChars) return false;
  return message.length > maxChars;
}

function evaluateRegexFilter(config: Record<string, unknown>, message: string): boolean {
  const pattern = config.pattern as string | undefined;
  if (!pattern) return false;
  try {
    const flags = (config.flags as string) ?? 'i';
    return new RegExp(pattern, flags).test(message);
  } catch {
    return false;
  }
}
