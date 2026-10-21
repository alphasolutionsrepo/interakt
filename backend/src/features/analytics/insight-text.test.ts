// src/features/analytics/insight-text.test.ts

import { describe, expect, it } from 'vitest';

import { NEEDS_FULL_TELEMETRY, textAvailability } from './insight-text';

const KEYS = ['alpha.chat.user_message'];

describe('textAvailability', () => {
  it('notes why an insight is empty when its spans hold no visitor text (Metadata only)', () => {
    expect(textAvailability([{ attributes: { 'alpha.ai.total_tokens': 5 } }], KEYS))
      .toEqual({ textAvailable: false, note: NEEDS_FULL_TELEMETRY });
  });

  it('adds no note when the text is there (Full)', () => {
    expect(textAvailability([{ attributes: { 'alpha.chat.user_message': 'boots' } }], KEYS)).toEqual({ textAvailable: true });
  });

  it('adds no note when there were no spans at all', () => {
    expect(textAvailability([], KEYS)).toEqual({ textAvailable: false });
  });
});
