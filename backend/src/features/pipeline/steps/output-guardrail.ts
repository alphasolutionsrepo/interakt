// src/features/pipeline/steps/output-guardrail.ts

/**
 * Output Guardrail Step
 *
 * Evaluates output rules against the AI's response before sending to the user.
 * Rules are defined in the AI Experience's guardrailConfig.outputGuardrail.
 *
 * Phase 1: max_length, regex_filter, blocklist.
 * Phase 2: PII redaction, citation validation, LLM judge.
 */

import type { Span } from '@opentelemetry/api';
import type { StepHandler, PipelineContext, StepResult } from '../pipeline.types';

interface OutputGuardrailConfig {
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

export const outputGuardrailHandler: StepHandler = {
  type: 'output_guardrail',

  async execute(
    config: Record<string, unknown>,
    ctx: PipelineContext,
    span: Span,
  ): Promise<StepResult> {
    const guardrail = config as unknown as OutputGuardrailConfig;

    if (!guardrail.enabled || !guardrail.rules?.length) {
      return { success: true, summary: 'No output guardrail rules configured' };
    }

    if (!ctx.responseText) {
      return { success: true, summary: 'No response to evaluate' };
    }

    const rules = guardrail.rules
      .filter(r => r.enabled)
      .sort((a, b) => a.priority - b.priority);

    let responseText = ctx.responseText;
    let blocked = false;
    let redacted = false;

    for (const rule of rules) {
      const result = evaluateOutputRule(rule, responseText);

      if (result.triggered) {
        span.setAttribute(`guardrail.output.${rule.id}`, rule.action);

        if (rule.action === 'block') {
          blocked = true;
          break;
        }
        if (rule.action === 'redact' && result.redactedText) {
          responseText = result.redactedText;
          redacted = true;
        }
      }
    }

    if (blocked) {
      const blockMessage = guardrail.onBlock?.message ?? 'The response was blocked by content policy.';
      ctx.responseText = blockMessage;
      return {
        success: true,
        abort: false, // Don't abort pipeline — we replaced the response
        data: { blocked: true },
        summary: 'Output blocked by guardrail',
      };
    }

    if (redacted) {
      ctx.responseText = responseText;
    }

    return {
      success: true,
      data: { blocked: false, redacted },
      summary: redacted ? 'Output modified by guardrail' : 'Output passed guardrail',
    };
  },
};

// ============================================================================
// RULE EVALUATION
// ============================================================================

interface OutputRuleResult {
  triggered: boolean;
  redactedText?: string;
}

function evaluateOutputRule(
  rule: OutputGuardrailConfig['rules'][0],
  text: string,
): OutputRuleResult {
  switch (rule.type) {
    case 'blocklist': {
      const terms = rule.config.terms as string[] | undefined;
      if (!terms?.length) return { triggered: false };
      const lower = text.toLowerCase();
      return { triggered: terms.some(t => lower.includes(t.toLowerCase())) };
    }
    case 'max_length': {
      const maxChars = rule.config.maxChars as number | undefined;
      if (!maxChars) return { triggered: false };
      if (text.length <= maxChars) return { triggered: false };
      // Redact by truncating
      return { triggered: true, redactedText: text.slice(0, maxChars) + '...' };
    }
    case 'regex_filter': {
      const pattern = rule.config.pattern as string | undefined;
      if (!pattern) return { triggered: false };
      try {
        const flags = (rule.config.flags as string) ?? 'gi';
        const replacement = (rule.config.replacement as string) ?? '[REDACTED]';
        const regex = new RegExp(pattern, flags);
        if (!regex.test(text)) return { triggered: false };
        return { triggered: true, redactedText: text.replace(regex, replacement) };
      } catch {
        return { triggered: false };
      }
    }
    default:
      return { triggered: false };
  }
}
