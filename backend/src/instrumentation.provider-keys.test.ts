// src/instrumentation.provider-keys.test.ts

/**
 * At start-up, AI provider keys saved on providers move into the Secrets Vault: after the
 * seeders (which may add providers) and before the background jobs start. Every start-up
 * step is stubbed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { register } from './instrumentation';

const steps = vi.hoisted(() => ({ order: [] as string[] }));

vi.mock('@/features/ai-providers/provider-key-migration', () => ({
  moveProviderKeysToVault: vi.fn(async () => { steps.order.push('provider keys'); }),
}));
vi.mock('@/shared/seeders', () => ({ runStartupSeeding: vi.fn(async () => { steps.order.push('seeding'); }) }));
vi.mock('@/features/jobs', () => ({ startJobs: vi.fn(async () => { steps.order.push('jobs'); }) }));
vi.mock('@/features/feature-switches/feature-switches.service', () => ({ isAreaOn: async () => false }));
vi.mock('@/shared/seeders/docs/docs-search.seeder', () => ({ buildDocsSearchOnStartup: vi.fn() }));
vi.mock('@/shared/setup/auto-migrate', () => ({ runDevMigrations: vi.fn() }));
vi.mock('@/features/analytics', () => ({ initializeAnalyticsConfig: vi.fn(), startAnalyticsCollector: vi.fn() }));
vi.mock('@/features/telemetry', () => ({ initializeTelemetryConfig: vi.fn(), initializeTelemetry: vi.fn(), loadTelemetryOverridesFromDB: vi.fn() }));
vi.mock('@/features/search/providers', () => ({ initializeSearchProviders: vi.fn() }));
vi.mock('@/shared/setup/upgrade-preflight', () => ({ runUpgradePreflight: vi.fn() }));
vi.mock('@/shared/setup/admin-seed', () => ({ seedAdminFromYaml: vi.fn() }));

const runtime = process.env.NEXT_RUNTIME;
beforeEach(() => {
  process.env.NEXT_RUNTIME = 'nodejs';
  steps.order = [];
});
afterEach(() => {
  if (runtime === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = runtime;
});

describe('start-up', () => {
  it('moves saved AI provider keys into the vault once, after seeding and before the jobs start', async () => {
    await register();
    expect(steps.order).toEqual(['seeding', 'provider keys', 'jobs']);
  });
});
