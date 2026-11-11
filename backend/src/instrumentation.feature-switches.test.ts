// src/instrumentation.feature-switches.test.ts

/**
 * At start-up the docs search for the Help assistant is built only while the Help assistant is
 * on for this installation (and, as before, when the switches can't be read). Every start-up
 * step is stubbed; the feature switches answer through the test stub.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { register } from './instrumentation';

import { featureSwitchesStub } from '@/shared/test/feature-switches-stub';

const buildDocsSearchOnStartup = vi.hoisted(() => vi.fn(async () => undefined));
const switches = vi.hoisted(() => ({ fail: false }));

vi.mock('@/features/feature-switches/feature-switches.service', async () => {
  const { featureSwitchesService } = await import('@/shared/test/feature-switches-stub');
  return { isAreaOn: async (area: Parameters<typeof featureSwitchesService.isAreaOn>[0]) => {
    if (switches.fail) throw new Error('database unreachable');
    return featureSwitchesService.isAreaOn(area);
  } };
});
vi.mock('@/shared/seeders/docs/docs-search.seeder', () => ({ buildDocsSearchOnStartup }));
vi.mock('@/shared/setup/auto-migrate', () => ({ runDevMigrations: vi.fn() }));
vi.mock('@/features/analytics', () => ({ initializeAnalyticsConfig: vi.fn(), startAnalyticsCollector: vi.fn() }));
vi.mock('@/features/telemetry', () => ({ initializeTelemetryConfig: vi.fn(), initializeTelemetry: vi.fn(), loadTelemetryOverridesFromDB: vi.fn() }));
vi.mock('@/features/search/providers', () => ({ initializeSearchProviders: vi.fn() }));
vi.mock('@/shared/seeders', () => ({ runStartupSeeding: vi.fn() }));
vi.mock('@/shared/setup/upgrade-preflight', () => ({ runUpgradePreflight: vi.fn() }));
vi.mock('@/shared/setup/admin-seed', () => ({ seedAdminFromYaml: vi.fn() }));
vi.mock('@/features/jobs', () => ({ startJobs: vi.fn(async () => undefined) }));

const runtime = process.env.NEXT_RUNTIME;
beforeEach(() => {
  process.env.NEXT_RUNTIME = 'nodejs';
  featureSwitchesStub.reset();
  switches.fail = false;
  buildDocsSearchOnStartup.mockClear();
});
afterEach(() => {
  if (runtime === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = runtime;
});

describe('the docs build at start-up', () => {
  it('runs while the Help assistant is on', async () => {
    await register();
    expect(buildDocsSearchOnStartup).toHaveBeenCalledTimes(1);
  });

  it('is skipped with the Help assistant turned off', async () => {
    featureSwitchesStub.off = new Set(['help-assistant']);
    await register();
    expect(buildDocsSearchOnStartup).not.toHaveBeenCalled();
  });

  it('runs as before when the switches can\'t be read', async () => {
    switches.fail = true;
    await register();
    expect(buildDocsSearchOnStartup).toHaveBeenCalledTimes(1);
  });
});
