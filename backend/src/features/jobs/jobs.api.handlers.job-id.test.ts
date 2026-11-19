/**
 * The job detail and action handlers answer 404 for an id or queue that can't name a job,
 * instead of the 500 pg-boss's refusal used to give.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const boss = vi.hoisted(() => ({ getQueue: vi.fn(), findJobs: vi.fn(), cancel: vi.fn() }));
vi.mock('./jobs.boot', () => ({ getBoss: () => boss, ensureJobsStarted: async () => boss }));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'u1' }));
vi.mock('@/db/index', () => ({ db: {} }));

import { handleGetJob, handleJobAction } from './jobs.api.handlers';

const GOOD = '11111111-1111-4111-8111-111111111111';
const action = (body: unknown) => new NextRequest('http://localhost/api/jobs/q/id', { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  boss.getQueue.mockImplementation(async (name: string) => (name === 'health-check' ? { name } : null));
  boss.findJobs.mockResolvedValue([]);
});

describe('GET /api/jobs/[queue]/[id]', () => {
  it.each([
    ['an id that is not a UUID', 'health-check', 'not-a-uuid'],
    ['a queue that does not exist', 'no-such-queue', GOOD],
    ['a queue name pg-boss would refuse', 'bad name', GOOD],
  ])('answers 404 Job not found for %s', async (_, queue, id) => {
    const res = await handleGetJob(queue, id);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND', message: 'Job not found' });
  });
});

describe('POST /api/jobs/[queue]/[id]', () => {
  it.each([
    ['an id that is not a UUID', 'health-check', 'not-a-uuid'],
    ['a queue that does not exist', 'no-such-queue', GOOD],
    ['a queue name pg-boss would refuse', 'bad name', GOOD],
  ])('answers 404 for %s without acting', async (_, queue, id) => {
    const res = await handleJobAction(queue, id, action({ action: 'cancel' }));
    expect(res.status).toBe(404);
    expect(boss.cancel).not.toHaveBeenCalled();
  });

  it('still acts on a job in a queue that exists', async () => {
    const res = await handleJobAction('health-check', GOOD, action({ action: 'cancel' }));
    expect(res.status).toBe(200);
    expect(boss.cancel).toHaveBeenCalledWith('health-check', GOOD);
  });
});
