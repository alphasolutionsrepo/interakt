// src/app/api/analytics/session/route.no-address.integration.test.ts

/**
 * A session started through the real route and session service, stored in real Postgres
 * (PGlite with the analytics migrations): no client address and no hash of one is stored,
 * even with the old ANALYTICS_TRACK_IP_HASH setting on, user tracking switched on, or
 * `trackIPHash: true` sent to the settings API or as one experience's override. The user agent is the control: it is stored,
 * so tracking is on and the row is written.
 */

import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

vi.hoisted(() => { process.env.ANALYTICS_TRACK_IP_HASH = 'true'; });

let testDb: AnalyticsTestDb;
vi.mock('@/db/index', () => ({
  get analyticsDB() { return testDb.db; },
  db: null,
}));
vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);

import { analyticsSessions } from '@/db/analytics-schema/search-analytics.schema';
import { clearAllRuntimeOverrides } from '@/features/analytics/analytics-config';

import { PUT as updateConfig } from '../config/route';
import { POST as enableUserTracking } from '../config/enable-user-tracking/route';
import { PUT as setExperienceOverride } from '../config/experience/route';
import { POST as startSession } from './route';

beforeAll(async () => { testDb = await createAnalyticsTestDb(); });
afterAll(async () => { await testDb.close(); delete process.env.ANALYTICS_TRACK_IP_HASH; });
beforeEach(async () => { await testDb.reset(); clearAllRuntimeOverrides(); });

const start = (sessionId: string) => startSession(new NextRequest('http://interakt.test/api/analytics/session', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'user-agent': 'TestBrowser/1.0',
    'X-Forwarded-For': '1.1.1.1, 9.9.9.9',
    'X-Real-IP': '9.9.9.9',
  },
  body: JSON.stringify({ sessionId, sessionType: 'search_only' }),
}));

async function storedRow() {
  const rows = await testDb.db.select().from(analyticsSessions);
  expect(rows).toHaveLength(1);
  return rows[0];
}

describe('an analytics session stored with every tracking option on', () => {
  it('keeps no client address after user tracking is switched on', async () => {
    expect((await enableUserTracking()).status).toBe(200);

    expect((await start('session-a')).status).toBe(200);

    const row = await storedRow();
    expect(row.userAgent).toBe('TestBrowser/1.0');
    expect(row.ipHash).toBeNull();
    expect(JSON.stringify(row)).not.toContain('9.9.9.9');
  });

  it('keeps no client address after the settings API is sent trackIPHash: true', async () => {
    const body = JSON.stringify({ trackSessions: true, trackUserAgent: true, trackIPHash: true });
    const updated = await updateConfig(new NextRequest('http://interakt.test/api/analytics/config', { method: 'PUT', body }));
    expect(updated.status).toBe(200);
    // The settings it answers with have no address option to show
    expect(JSON.stringify(await updated.json())).not.toMatch(/trackIPHash/i);

    expect((await start('session-b')).status).toBe(200);

    const row = await storedRow();
    expect(row.userAgent).toBe('TestBrowser/1.0');
    expect(row.ipHash).toBeNull();
  });

  it('keeps no client address after an experience override is sent trackIPHash: true', async () => {
    const experienceId = crypto.randomUUID();
    const body = JSON.stringify({ experienceId, overrides: { trackSessions: true, trackUserAgent: true, trackIPHash: true } });
    expect((await setExperienceOverride(new NextRequest('http://interakt.test/api/analytics/config/experience', { method: 'PUT', body }))).status).toBe(200);

    const response = await startSession(new NextRequest('http://interakt.test/api/analytics/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'TestBrowser/1.0', 'X-Forwarded-For': '1.1.1.1, 9.9.9.9' },
      body: JSON.stringify({ sessionId: 'session-c', experienceId, sessionType: 'chat' }),
    }));
    expect(response.status).toBe(200);

    const row = await storedRow();
    expect(row.experienceId).toBe(experienceId);
    expect(row.ipHash).toBeNull();
  });
});
