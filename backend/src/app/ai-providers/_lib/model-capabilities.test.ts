// src/app/ai-providers/_lib/model-capabilities.test.ts

import { describe, expect, it } from 'vitest';

import { capabilitiesFromForm, reasoningChoiceOf } from './model-capabilities';

describe('model form reasoning', () => {
  it("sends nothing for 'Model default', which clears a saved level (capabilities are replaced on update)", () => {
    expect(capabilitiesFromForm({ reasoningEffort: 'default' })).toEqual({});
  });

  it('sends a chosen level', () => {
    expect(capabilitiesFromForm({ reasoningEffort: 'none', noTemperature: true }))
      .toEqual({ reasoningEffort: 'none', noTemperature: true });
  });

  it('shows a saved level, and unset or unknown as Model default', () => {
    expect(reasoningChoiceOf({ reasoningEffort: 'low' })).toBe('low');
    expect(reasoningChoiceOf({})).toBe('default');
    expect(reasoningChoiceOf({ reasoningEffort: 'extreme' })).toBe('default');
  });
});
