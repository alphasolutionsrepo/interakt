// src/features/analytics/analytics-processing.not-configured.test.ts

/**
 * Without an analytics database (no ANALYTICS_POSTGRES_URL) a processing run fails as a
 * setting to fix, which the job and the processing stream explain to admins.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/index', () => ({ analyticsDB: null, db: {} }));

import { runAnalyticsProcessing } from './analytics-processing.service';

import { toAppError } from '@/shared/errors/to-app-error';

describe('a processing run without an analytics database', () => {
  it('fails as analytics not set up, naming the setting', async () => {
    const result = await runAnalyticsProcessing();

    expect(result.status).toBe('failed');
    expect(toAppError(result.cause)).toMatchObject({ code: 'SETUP_REQUIRED', message: expect.stringContaining('ANALYTICS_POSTGRES_URL') });
  });
});
