// src/features/search-experience/query-understanding-timeout.test.ts

/**
 * The query understanding time limit: accepted from 0.5 to 10 seconds as whole ms,
 * absent on experiences saved before it existed (the interpreter then uses 3000 ms),
 * and typed in seconds on the settings screens.
 */

import { describe, expect, it } from 'vitest';

import { queryUnderstandingConfigSchema, updateSearchExperienceSchema } from './search-experience.schemas';
import {
  DEFAULT_QUERY_UNDERSTANDING_CONFIG,
  timeoutMsFromSeconds,
  timeoutSecondsFromMs,
} from './search-experience.types';
import { wizardStep3Schema, WIZARD_DEFAULT_VALUES } from './search-experience.wizard-schemas';

const parse = (timeoutMs: unknown) => queryUnderstandingConfigSchema.safeParse({ enabled: true, minWords: 3, timeoutMs });

describe('timeoutMs in the query understanding config', () => {
  it('accepts whole ms from 500 to 10000', () => {
    expect(parse(500).success).toBe(true);
    expect(parse(10000).success).toBe(true);
    expect(parse(2500).success).toBe(true);
  });

  it('refuses values outside the range, fractions and non-numbers', () => {
    expect(parse(499).success).toBe(false);
    expect(parse(10001).success).toBe(false);
    expect(parse(1500.5).success).toBe(false);
    expect(parse('3000').success).toBe(false);
  });

  it('may be absent', () => {
    const result = queryUnderstandingConfigSchema.parse({ enabled: true, minWords: 3 });
    expect(result.timeoutMs).toBeUndefined();
  });

  it('is checked on update and in the wizard', () => {
    expect(updateSearchExperienceSchema.safeParse({ aiConfig: { queryUnderstanding: { enabled: true, minWords: 3, timeoutMs: 100 } } }).success).toBe(false);
    expect(updateSearchExperienceSchema.safeParse({ aiConfig: { queryUnderstanding: { enabled: true, minWords: 3, timeoutMs: 4000 } } }).success).toBe(true);
    const wizard = (timeoutMs: number) => wizardStep3Schema.safeParse({
      ...WIZARD_DEFAULT_VALUES,
      aiConfig: { ...WIZARD_DEFAULT_VALUES.aiConfig, queryUnderstanding: { enabled: true, minWords: 3, timeoutMs } },
    }).success;
    expect(wizard(20000)).toBe(false);
    expect(wizard(2000)).toBe(true);
  });

  it('starts at 3000 ms for new experiences', () => {
    expect(DEFAULT_QUERY_UNDERSTANDING_CONFIG.timeoutMs).toBe(3000);
    expect(WIZARD_DEFAULT_VALUES.aiConfig.queryUnderstanding.timeoutMs).toBe(3000);
  });
});

describe('the time limit in seconds on the settings screens', () => {
  it('shows the saved limit, or 3 s when none is saved', () => {
    expect(timeoutSecondsFromMs(1500)).toBe(1.5);
    expect(timeoutSecondsFromMs(undefined)).toBe(3);
  });

  it('stores typed seconds as ms within the allowed range', () => {
    expect(timeoutMsFromSeconds('2.5')).toBe(2500);
    expect(timeoutMsFromSeconds('0.1')).toBe(500);
    expect(timeoutMsFromSeconds('60')).toBe(10000);
    expect(timeoutMsFromSeconds('')).toBe(3000);
  });
});
