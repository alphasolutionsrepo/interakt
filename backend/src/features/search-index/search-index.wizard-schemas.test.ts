// src/features/search-index/search-index.wizard-schemas.test.ts

/** Wizard step 3: a missing or wrongly typed embedding model gives the one clear message. */

import { describe, expect, it } from 'vitest';

import { wizardStep3Schema } from './search-index.wizard-schemas';

const valid = { aiProviderId: '123e4567-e89b-42d3-a456-426614174000', aiModelId: 7, embeddingDimensions: 1536 };
const messagesFor = (input: Record<string, unknown>) =>
  wizardStep3Schema.safeParse(input).error?.issues.filter((i) => i.path[0] === 'aiModelId').map((i) => i.message);

describe('wizardStep3Schema aiModelId', () => {
  it('accepts a positive whole model number', () => {
    expect(wizardStep3Schema.parse(valid).aiModelId).toBe(7);
  });

  it('missing: exactly "Please select an embedding model"', () => {
    const { aiModelId: _omit, ...rest } = valid;
    expect(messagesFor(rest)).toEqual(['Please select an embedding model']);
  });

  it.each([['a string', '7'], ['null', null], ['an object', {}]])('wrong type (%s): exactly "Please select an embedding model"', (_n, value) => {
    expect(messagesFor({ ...valid, aiModelId: value })).toEqual(['Please select an embedding model']);
  });

  it('zero keeps the same message', () => {
    expect(messagesFor({ ...valid, aiModelId: 0 })).toEqual(['Please select an embedding model']);
  });
});
