// src/features/guardrails/rule-match.ts

/**
 * Whether a blocklist, max_length or regex_filter guardrail rule matches a text.
 * Shared by the input rules (message-classifier) and the output rules
 * (output-guardrail). Other rule types never match here.
 */
export function ruleMatches(rule: { type: string; config: Record<string, unknown> }, text: string): boolean {
  switch (rule.type) {
    case 'blocklist': {
      const raw = rule.config.terms as unknown[] | undefined;
      // Stored config is untrusted: skip anything that is not a non-empty string
      const terms = (raw ?? []).filter((t): t is string => typeof t === 'string' && t !== '');
      if (!terms.length) return false;
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
