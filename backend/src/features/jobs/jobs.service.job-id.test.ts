/**
 * A job id that isn't a UUID names no job: it is answered without asking pg-boss, whose
 * query Postgres would refuse.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const boss = vi.hoisted(() => ({
  getQueue: vi.fn(),
  findJobs: vi.fn(),
  cancel: vi.fn(),
  resume: vi.fn(),
  retry: vi.fn(),
  deleteJob: vi.fn(),
}));
const getBoss = vi.hoisted(() => vi.fn());
vi.mock('./jobs.boot', () => ({ getBoss }));
vi.mock('@/db/index', () => ({ db: {} }));

import { applyJobAction, getJob } from './jobs.service';

import { NotFoundError } from '@/shared/errors/app-error';

const GOOD = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  getBoss.mockReturnValue(boss);
  boss.getQueue.mockImplementation(async (name: string) => (name === 'some-queue' ? { name } : null));
});

describe('getJob', () => {
  it.each(['x', '', 'not-a-uuid'])('answers null for %j without asking pg-boss', async (id) => {
    expect(await getJob('some-queue', id)).toBeNull();
    expect(getBoss).not.toHaveBeenCalled();
    expect(boss.findJobs).not.toHaveBeenCalled();
  });

  it('still asks pg-boss for a well-formed id', async () => {
    boss.findJobs.mockResolvedValue([{ id: GOOD, name: 'some-queue', state: 'completed', data: { a: 1 }, createdOn: new Date(0) }]);
    expect(await getJob('some-queue', GOOD)).toMatchObject({ id: GOOD, queue: 'some-queue', state: 'completed' });
    expect(boss.findJobs).toHaveBeenCalledWith('some-queue', { id: GOOD });
  });

  it('answers null for a well-formed id nobody holds', async () => {
    boss.findJobs.mockResolvedValue([]);
    expect(await getJob('some-queue', GOOD)).toBeNull();
    expect(boss.findJobs).toHaveBeenCalledTimes(1);
  });
});

describe('applyJobAction', () => {
  it.each(['cancel', 'resume', 'retry', 'delete'] as const)('refuses %s on an id that is not a UUID as not found, without asking pg-boss', async (action) => {
    const err = await applyJobAction('some-queue', 'x', action).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect((err as Error).message).toBe('Job not found');
    expect(getBoss).not.toHaveBeenCalled();
    for (const fn of Object.values(boss)) expect(fn).not.toHaveBeenCalled();
  });

  it.each([
    ['cancel', 'cancel'],
    ['resume', 'resume'],
    ['retry', 'retry'],
    ['delete', 'deleteJob'],
  ] as const)('still passes a well-formed id to pg-boss for %s', async (action, method) => {
    await applyJobAction('some-queue', GOOD, action);
    expect(boss[method]).toHaveBeenCalledWith('some-queue', GOOD);
  });
});

describe('a queue that does not exist', () => {
  it('holds no job: getJob answers null without searching it', async () => {
    expect(await getJob('no-such-queue', GOOD)).toBeNull();
    expect(boss.getQueue).toHaveBeenCalledWith('no-such-queue');
    expect(boss.findJobs).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'resume', 'retry', 'delete'] as const)('refuses %s with Job not found, without calling pg-boss', async (action) => {
    await expect(applyJobAction('no-such-queue', GOOD, action)).rejects.toBeInstanceOf(NotFoundError);
    expect(boss.cancel).not.toHaveBeenCalled();
    expect(boss.resume).not.toHaveBeenCalled();
    expect(boss.retry).not.toHaveBeenCalled();
    expect(boss.deleteJob).not.toHaveBeenCalled();
  });
});

describe('a queue name pg-boss would refuse', () => {
  it.each(['bad name', 'semi;colon', 'quote"d'])('holds no job: %j is answered without asking pg-boss', async (queue) => {
    expect(await getJob(queue, GOOD)).toBeNull();
    await expect(applyJobAction(queue, GOOD, 'cancel')).rejects.toBeInstanceOf(NotFoundError);
    expect(getBoss).not.toHaveBeenCalled();
  });

  it('still accepts the characters pg-boss allows', async () => {
    boss.findJobs.mockResolvedValue([]);
    boss.getQueue.mockResolvedValue({ name: 'a.b-c/d_e' });
    expect(await getJob('a.b-c/d_e', GOOD)).toBeNull();
    expect(boss.findJobs).toHaveBeenCalledWith('a.b-c/d_e', { id: GOOD });
  });
});
