// src/app/api/admin/setup-demo/route.areas-off.test.ts

/**
 * The demo builds and exercises a search index, a search experience and a chat experience, so
 * setting it up is refused ("turned off", 404) unless Search, Chat and Managed indexes are all
 * on, before anything is loaded or built. Removing the demo (reset) works with any area off.
 */

import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
vi.mock('@/db/index', () => ({ db: {} }));
const demo = vi.hoisted(() => ({ loadDemoManifest: vi.fn(), seedDemo: vi.fn(), resetDemo: vi.fn(), runWarmup: vi.fn() }));
vi.mock('@/shared/seeders/demo', () => demo);

import { POST } from './route';

import { TURNED_OFF_CODE } from '@/features/feature-switches/areas';
import type { Area } from '@/features/feature-switches/areas';
import { featureSwitchesStub } from '@/shared/test/feature-switches-stub';

const post = (body: Record<string, unknown>) => POST(new NextRequest('http://localhost/api/admin/setup-demo', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
}));

afterEach(() => {
  featureSwitchesStub.reset();
  vi.clearAllMocks();
});

describe('setting up the demo with an area off', () => {
  it.each(['search', 'chat', 'managed-indexes'] as Area[])('is refused as turned off with %s off, and nothing is built', async (area) => {
    featureSwitchesStub.off.add(area);
    for (const stream of [false, true]) {
      const res = await post({ action: 'seed', stream });
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ code: TURNED_OFF_CODE });
    }
    expect(demo.loadDemoManifest).not.toHaveBeenCalled();
    expect(demo.seedDemo).not.toHaveBeenCalled();
  });

  it('is refused when no action is given (seed is the default)', async () => {
    featureSwitchesStub.off.add('chat');
    expect((await post({})).status).toBe(404);
    expect(demo.seedDemo).not.toHaveBeenCalled();
  });

  it('removes the demo with every area off', async () => {
    for (const area of ['search', 'chat', 'managed-indexes'] as Area[]) featureSwitchesStub.off.add(area);
    demo.loadDemoManifest.mockResolvedValue({});
    demo.resetDemo.mockResolvedValue({ deleted: [], failed: [] });
    const res = await post({ action: 'reset' });
    expect(res.status).toBe(200);
    expect(demo.resetDemo).toHaveBeenCalled();
  });

  it('sets up the demo with all three on', async () => {
    demo.loadDemoManifest.mockResolvedValue({ manifest: { warmup: { enabled: false } } });
    demo.seedDemo.mockResolvedValue({ skipped: true, provider: 'ollama' });
    const res = await post({ action: 'seed' });
    expect(res.status).toBe(200);
    expect(demo.seedDemo).toHaveBeenCalled();
  });
});
