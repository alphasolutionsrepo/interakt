// src/app/api/admin/setup-docs/route.setup-required.test.ts

/**
 * Building the docs assistant before the admin has set up what it needs answers with the
 * seeder's own instruction (what to configure), logged once as a warning: a setup step
 * left to do, not a server failure. Through the real route and seeder; the AI defaults,
 * the admin lookup and storage are stubbed.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as setupDocs } from './route';

import { errorEvent } from '@/shared/test/error-answers';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
vi.mock('server-only', () => ({}));
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
const defaults = vi.hoisted(() => ({ embedding: {} as Record<string, unknown> }));
vi.mock('@/features/ai-providers/ai-providers.service', () => ({ getResolvedDefaults: async () => defaults }));
vi.mock('@/shared/seeders/docs/docs-source', () => ({ DOCS_ROOT: '/docs', getAdminUserId: async () => 'admin', readDocs: vi.fn() }));
vi.mock('@/db/index', () => ({ db: {} }));


const build = () => setupDocs(new NextRequest('http://localhost/api/admin/setup-docs', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ stream: true }),
}));

beforeEach(() => { logs.length = 0; });

describe('building the docs assistant before its setup is done', () => {
  it.each([
    ['without a default embedding model', {}, /No system default embedding model is configured/],
    ['with a default embedding model of the wrong size', { providerId: 'p', modelId: 'm', modelKey: 'nomic-embed-text', dimensions: 768 }, /produces 768-dim vectors.*Pick a 1536-dim embedding model/],
  ])('%s says what to set up, logged once as a warning', async (_, embedding, instruction) => {
    defaults.embedding = embedding;

    const event = await errorEvent(await build());

    expect(event).toMatchObject({ code: 'SETUP_REQUIRED', error: expect.stringMatching(instruction), requestId: expect.any(String) });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ operation: 'setupDocsStream' }) })]);
  });
});
