// src/instrumentation.telemetry-order.test.ts

/**
 * At start-up, tracing is set up before the per-experience telemetry settings load and before
 * the search providers register: register() waits for initializeTelemetry(), which loads the
 * OpenTelemetry SDK asynchronously. Every other start-up step is stubbed.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { register } from './instrumentation';

const steps = vi.hoisted(() => ({
  order: [] as string[],
  releaseTelemetry: () => {},
}));

vi.mock('@/features/telemetry', () => ({
  initializeTelemetryConfig: vi.fn(),
  initializeTelemetry: vi.fn(() => new Promise<void>((resolve) => {
    steps.releaseTelemetry = () => { steps.order.push('telemetry'); resolve(); };
  })),
  loadTelemetryOverridesFromDB: vi.fn(async () => { steps.order.push('telemetry overrides'); }),
}));
vi.mock('@/features/search/providers', () => ({
  initializeSearchProviders: vi.fn(() => { steps.order.push('search providers'); }),
}));
vi.mock('@/features/feature-switches/feature-switches.service', () => ({ isAreaOn: async () => false }));
vi.mock('@/shared/seeders/docs/docs-search.seeder', () => ({ buildDocsSearchOnStartup: vi.fn() }));
vi.mock('@/shared/setup/auto-migrate', () => ({ runDevMigrations: vi.fn() }));
vi.mock('@/features/analytics', () => ({ initializeAnalyticsConfig: vi.fn(), startAnalyticsCollector: vi.fn() }));
vi.mock('@/shared/seeders', () => ({ runStartupSeeding: vi.fn() }));
vi.mock('@/shared/setup/upgrade-preflight', () => ({ runUpgradePreflight: vi.fn() }));
vi.mock('@/features/ai-providers/provider-key-encryption', () => ({ encryptStoredProviderKeys: vi.fn() }));
vi.mock('@/shared/setup/admin-seed', () => ({ seedAdminFromYaml: vi.fn() }));
vi.mock('@/features/jobs', () => ({ startJobs: vi.fn(async () => undefined) }));

const runtime = process.env.NEXT_RUNTIME;
beforeEach(() => {
  process.env.NEXT_RUNTIME = 'nodejs';
  steps.order = [];
});
afterEach(() => {
  if (runtime === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = runtime;
});

describe('start-up order', () => {
  it('waits for tracing before the telemetry settings and the search providers', async () => {
    const started = register();
    // Let the start-up steps before tracing run.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(steps.order).toEqual([]);

    steps.releaseTelemetry();
    await started;
    expect(steps.order).toEqual(['telemetry', 'telemetry overrides', 'search providers']);
  });
});
