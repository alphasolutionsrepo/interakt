// src/features/telemetry/telemetry.config.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  initializeTelemetryConfig,
  getTelemetryDetailLevel,
  isTelemetryEnabled,
  runWithoutTracing,
  runWithTelemetryLevel,
  setExperienceTelemetryOverride,
  clearAllTelemetryOverrides,
} from './telemetry.config';

// Must match GLOBAL_CONFIG_KEY in telemetry.config.ts
const GLOBAL_CONFIG_KEY = '__alpha_telemetry_config__';

describe('telemetry gating', () => {
  const previous = process.env.ENABLE_OTEL;

  beforeAll(() => {
    process.env.ENABLE_OTEL = 'true';
    delete (globalThis as Record<string, unknown>)[GLOBAL_CONFIG_KEY];
    initializeTelemetryConfig().enabled = true;
  });

  afterAll(() => {
    clearAllTelemetryOverrides();
    process.env.ENABLE_OTEL = previous;
  });

  it('honours a per-experience "off"', () => {
    setExperienceTelemetryOverride('exp-off', 'off');
    setExperienceTelemetryOverride('exp-full', 'full');
    expect(isTelemetryEnabled('exp-off')).toBe(false);
    expect(getTelemetryDetailLevel('exp-full')).toBe('full');
  });

  it('turns tracing off for everything inside runWithoutTracing', async () => {
    expect(getTelemetryDetailLevel('exp-full')).toBe('full');
    await runWithoutTracing(async () => {
      await Promise.resolve();
      expect(getTelemetryDetailLevel('exp-full')).toBe('off');
      expect(isTelemetryEnabled(undefined)).toBe(false);
    });
    expect(getTelemetryDetailLevel('exp-full')).toBe('full');
  });
});

describe('request-level telemetry', () => {
  it('forces a level for everything inside runWithTelemetryLevel', async () => {
    setExperienceTelemetryOverride('exp-off-2', 'off');
    await runWithTelemetryLevel('full', async () => {
      await Promise.resolve();
      expect(getTelemetryDetailLevel('exp-off-2')).toBe('full');
    });
    expect(getTelemetryDetailLevel('exp-off-2')).toBe('off');
  });
});
