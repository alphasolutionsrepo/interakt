// app/ai-experiences/_components/pipeline/pipeline-payloads.ts

/**
 * Partial-update payload builders for experience config objects.
 *
 * Each spreads the current object so a single-field change does not drop its siblings —
 * the update API replaces a config object wholesale.
 */

/** Merge a partial change into a config object and return the update payload key. */
export function sessionPayload(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { sessionConfig: { ...current, ...patch } };
}

export function personaPayload(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { personaConfig: { ...current, ...patch } };
}

export const DEFAULT_GUARDRAIL_SIDE = { enabled: false, rules: [], onBlock: { message: 'Your message was blocked by content policy.' } };

export function guardrailPayload(
  current: Record<string, unknown> | null | undefined,
  side: 'inputGuardrail' | 'outputGuardrail',
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = (current ?? {}) as Record<string, unknown>;
  const otherSide = side === 'inputGuardrail' ? 'outputGuardrail' : 'inputGuardrail';
  // Ensure both sides always have valid defaults — Zod requires both
  const currentSide = (base[side] ?? { ...DEFAULT_GUARDRAIL_SIDE }) as Record<string, unknown>;
  const currentOther = (base[otherSide] ?? { ...DEFAULT_GUARDRAIL_SIDE }) as Record<string, unknown>;
  return {
    guardrailConfig: {
      [side]: { ...currentSide, ...patch },
      [otherSide]: currentOther,
    },
  };
}
