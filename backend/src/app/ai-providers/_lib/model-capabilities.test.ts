// src/app/ai-providers/_lib/model-capabilities.test.ts

import { describe, expect, it } from 'vitest';

import { REASONING_EFFORTS } from '@/features/ai-providers/ai-providers.validation';

import { capabilitiesFromForm, REASONING_CHOICES, REASONING_LABELS, reasoningChoiceOf } from './model-capabilities';

describe('model form reasoning', () => {
  it("sends nothing for 'Model default', which clears a saved level (capabilities are replaced on update)", () => {
    expect(capabilitiesFromForm({ reasoningEffort: 'default' })).toEqual({});
  });

  it('sends a chosen level', () => {
    expect(capabilitiesFromForm({ reasoningEffort: 'none', noTemperature: true }))
      .toEqual({ reasoningEffort: 'none', noTemperature: true });
  });

  it("keeps saved capabilities the form doesn't show", () => {
    const saved = { contextWindow: 32768, supportsStreaming: true, supportsFunctionCalling: true };
    expect(capabilitiesFromForm({ reasoningEffort: 'none' }, saved))
      .toEqual({ ...saved, reasoningEffort: 'none' });
  });

  it('clears saved form choices that are now off', () => {
    const saved = { contextWindow: 8192, reasoningEffort: 'low', noTemperature: true, usesCompletionTokens: true };
    expect(capabilitiesFromForm({ reasoningEffort: 'default', noTemperature: false }, saved))
      .toEqual({ contextWindow: 8192 });
  });

  it('offers and keeps every level the server accepts', () => {
    expect(REASONING_CHOICES).toEqual(['default', ...REASONING_EFFORTS]);
    for (const level of REASONING_EFFORTS) {
      expect(reasoningChoiceOf(capabilitiesFromForm({ reasoningEffort: level }))).toBe(level);
      expect(REASONING_LABELS[level]).toBeTruthy();
    }
  });

  it('shows a saved level, and unset or unknown as Model default', () => {
    expect(reasoningChoiceOf({ reasoningEffort: 'low' })).toBe('low');
    expect(reasoningChoiceOf({})).toBe('default');
    expect(reasoningChoiceOf({ reasoningEffort: 'extreme' })).toBe('default');
  });
});
