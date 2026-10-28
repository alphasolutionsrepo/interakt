// src/features/jobs/jobs.boot.test.ts

/**
 * A job type's default schedule is set once. After that the schedule belongs to
 * the admin: one they removed in the operator console stays removed across
 * restarts, and one they set themselves is never replaced.
 */

import type { PgBoss } from 'pg-boss';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setDefaultScheduleOnce } from './jobs.boot';

/** Just enough of pg-boss: queues by name and schedules by queue */
function fakeBoss() {
  const queues = new Set<string>();
  const schedules = new Map<string, string>();
  const boss = {
    getQueue: vi.fn(async (name: string) => (queues.has(name) ? { name } : null)),
    createQueue: vi.fn(async (name: string) => void queues.add(name)),
    getSchedules: vi.fn(async (name: string) => (schedules.has(name) ? [{ name, cron: schedules.get(name) }] : [])),
    schedule: vi.fn(async (name: string, cron: string) => void schedules.set(name, cron)),
    unschedule: vi.fn(async (name: string) => void schedules.delete(name)),
  };
  return { boss, schedules, instance: boss as unknown as PgBoss };
}

const NIGHTLY = { cron: '0 2 * * *', timezone: 'UTC' };

let fake: ReturnType<typeof fakeBoss>;
beforeEach(() => {
  fake = fakeBoss();
});

describe('setDefaultScheduleOnce', () => {
  it('sets the default the first time', async () => {
    await setDefaultScheduleOnce(fake.instance, 'refresh-insights', NIGHTLY);

    expect(fake.schedules.get('refresh-insights')).toBe('0 2 * * *');
  });

  it('does not bring back a schedule the admin removed', async () => {
    await setDefaultScheduleOnce(fake.instance, 'refresh-insights', NIGHTLY);
    await fake.boss.unschedule('refresh-insights');

    // Next restart
    await setDefaultScheduleOnce(fake.instance, 'refresh-insights', NIGHTLY);

    expect(fake.schedules.has('refresh-insights')).toBe(false);
  });

  it('keeps a schedule that already exists', async () => {
    fake.schedules.set('refresh-insights', '0 6 * * 1');

    await setDefaultScheduleOnce(fake.instance, 'refresh-insights', NIGHTLY);

    expect(fake.schedules.get('refresh-insights')).toBe('0 6 * * 1');
    expect(fake.boss.schedule).not.toHaveBeenCalled();
  });

  it('tries again on the next start when the default could not be set', async () => {
    fake.boss.schedule.mockRejectedValueOnce(new Error('Invalid cron'));

    await setDefaultScheduleOnce(fake.instance, 'refresh-insights', NIGHTLY);
    expect(fake.schedules.has('refresh-insights')).toBe(false);

    await setDefaultScheduleOnce(fake.instance, 'refresh-insights', NIGHTLY);
    expect(fake.schedules.get('refresh-insights')).toBe('0 2 * * *');
  });
});
