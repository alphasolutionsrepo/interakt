// src/app/api/admin/setup-demo/route.setup-required.test.ts

/**
 * Setting up the demo when its data or the request isn't right answers with the
 * seeder's own words (what to fix), logged once as a warning: not the generic server
 * message. Through the real route, manifest loader and seeder; the database is stubbed.
 */

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { errorEvent } from '@/shared/test/error-answers';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
vi.mock('server-only', () => ({}));
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUser: async () => ({ id: 'admin', role: 'admin' }) }));
vi.mock('@/db/index', () => ({ db: {} }));

import { POST as setupDemo } from './route';

const setUp = (body: Record<string, unknown>) => setupDemo(new NextRequest('http://localhost/api/admin/setup-demo', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
}));

beforeEach(() => { logs.length = 0; });
afterEach(() => { vi.unstubAllEnvs(); });

describe('setting up the demo', () => {
  it('without its data files says where they were expected, as a setup step left to do', async () => {
    vi.stubEnv('DEMO_MANIFEST', '/nowhere/demo.manifest.yaml');

    const res = await setUp({ action: 'seed' });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ code: 'SETUP_REQUIRED', message: expect.stringMatching(/^Demo manifest not found at \/nowhere\/demo\.manifest\.yaml/) });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn' })]);
  });

  it('with a provider the demo has no option for names the ones it has, in the stream', async () => {
    const event = await errorEvent(await setUp({ action: 'seed', stream: true, provider: 'nope' }));

    expect(event).toMatchObject({ code: 'VALIDATION_ERROR', error: expect.stringMatching(/^Unknown provider "nope"\. Available: /) });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ operation: 'setupDemoStream' }) })]);
  });
});
