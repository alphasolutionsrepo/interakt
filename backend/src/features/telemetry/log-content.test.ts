// src/features/telemetry/log-content.test.ts

/**
 * Log lines keep a visitor's words only when the experience's telemetry level is 'full',
 * as traces do; otherwise they keep the length.
 */

import { trace } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ATTR } from './attribute-keys';
import { contentForLog, mayLogContent } from './log-content';
import {
  clearAllTelemetryOverrides,
  initializeTelemetryConfig,
  runWithTelemetryLevel,
  setExperienceTelemetryOverride,
} from './telemetry.config';

const QUESTION = 'can I defer my exam because of my health';

beforeEach(() => {
  initializeTelemetryConfig().enabled = true;
  setExperienceTelemetryOverride('exp-full', 'full');
  setExperienceTelemetryOverride('exp-metadata', 'metadata');
  setExperienceTelemetryOverride('exp-off', 'off');
});
afterEach(() => {
  clearAllTelemetryOverrides();
  initializeTelemetryConfig().enabled = false;
  vi.restoreAllMocks();
});

describe('contentForLog with an experience', () => {
  it('with maxChars, shortens the words it keeps', () => {
    expect(contentForLog({ query: QUESTION }, 'exp-full', { maxChars: 10 })).toEqual({ query: QUESTION.substring(0, 10) });
  });

  it('with maxChars, still logs the length of the whole text', () => {
    expect(contentForLog({ query: QUESTION }, 'exp-metadata', { maxChars: 10 })).toEqual({ queryLength: QUESTION.length });
  });

  it('keeps the words when the experience is set to full', () => {
    expect(contentForLog({ query: QUESTION }, 'exp-full')).toEqual({ query: QUESTION });
  });

  it.each(['exp-metadata', 'exp-off', 'exp-with-no-setting'])('keeps only the length for %s', (experienceId) => {
    expect(contentForLog({ query: QUESTION }, experienceId)).toEqual({ queryLength: QUESTION.length });
  });

  it('keeps only the length when telemetry is switched off, whatever the experience says', () => {
    initializeTelemetryConfig().enabled = false;
    expect(contentForLog({ query: QUESTION }, 'exp-full')).toEqual({ queryLength: QUESTION.length });
  });

  it('handles several fields and leaves out missing ones', () => {
    expect(contentForLog({ originalQuery: QUESTION, effectiveQuery: 'exam deferral', missing: undefined }, 'exp-metadata'))
      .toEqual({ originalQueryLength: QUESTION.length, effectiveQueryLength: 'exam deferral'.length });
  });
});

describe('mayLogContent without an experience', () => {
  const activeSpanWith = (attributes: Record<string, unknown>) =>
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue({ attributes } as unknown as ReturnType<typeof trace.getActiveSpan>);

  it("follows its trace's decision to keep content", () => {
    activeSpanWith({ [ATTR.CONTENT_RECORDED]: true });
    expect(mayLogContent()).toBe(true);
  });

  it("follows its trace's decision not to keep content", () => {
    activeSpanWith({ [ATTR.CONTENT_RECORDED]: false });
    // Even inside an admin's full trace request, the trace already decided
    expect(runWithTelemetryLevel('full', () => mayLogContent())).toBe(false);
  });

  it('keeps no words with no trace and no experience', () => {
    expect(mayLogContent()).toBe(false);
    expect(contentForLog({ query: QUESTION })).toEqual({ queryLength: QUESTION.length });
  });

  it('keeps the words when an admin asked for a full trace (playground)', () => {
    expect(runWithTelemetryLevel('full', () => mayLogContent())).toBe(true);
  });
});
