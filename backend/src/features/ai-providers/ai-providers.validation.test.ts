// src/features/ai-providers/ai-providers.validation.test.ts

import { describe, expect, it } from 'vitest';

import { modelCapabilitiesSchema } from './ai-providers.validation';

describe('model capabilities: reasoningEffort', () => {
  it.each(['none', 'minimal', 'low', 'medium', 'high'])('accepts %s', (effort) => {
    expect(modelCapabilitiesSchema.safeParse({ reasoningEffort: effort }).success).toBe(true);
  });

  it('refuses any other value, which would otherwise be sent to the provider as is', () => {
    expect(modelCapabilitiesSchema.safeParse({ reasoningEffort: 'extreme' }).success).toBe(false);
    expect(modelCapabilitiesSchema.safeParse({ reasoningEffort: 'default' }).success).toBe(false);
  });

  it('leaves it optional', () => {
    expect(modelCapabilitiesSchema.safeParse({}).success).toBe(true);
  });
});
