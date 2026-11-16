// src/features/dashboard/home.service.health-tasks.test.ts

import { describe, expect, it } from 'vitest';

import { healthFromJob, healthTasks } from './home.service';

describe('healthTasks', () => {
  it("names the service when the check gives no task of its own", () => {
    expect(healthTasks([
      { name: 'Elasticsearch', status: 'unhealthy' },
      { name: 'AI Providers', status: 'degraded' },
    ])).toEqual([
      { id: 'health:Elasticsearch', label: 'Elasticsearch is down', count: 1, href: '/health', tone: 'critical' },
      { id: 'health:AI Providers', label: 'AI Providers is degraded', count: 1, href: '/health', tone: 'warning' },
    ]);
  });

  it("uses the check's own task when it has one (a setup problem, not a service down)", () => {
    expect(healthTasks([{ name: 'Client addresses', status: 'degraded', task: 'Check how client addresses are read' }]))
      .toEqual([{ id: 'health:Client addresses', label: 'Check how client addresses are read', count: 1, href: '/health', tone: 'warning' }]);
  });
});

describe('healthFromJob', () => {
  it("keeps each problem's message and task from the stored job output, and leaves healthy services out", () => {
    const health = healthFromJob({
      status: 'degraded',
      checkedAt: '2026-11-16T10:00:00.000Z',
      services: [
        { name: 'Database (PostgreSQL)', status: 'healthy', message: 'Query time: 2ms' },
        { name: 'Client addresses', status: 'degraded', message: 'm', task: 'Check how client addresses are read' },
      ],
    }, '2026-11-16T10:00:01.000Z', new Date('2026-11-16T10:05:00.000Z'));
    expect(health).toEqual({
      status: 'degraded',
      checkedAt: '2026-11-16T10:00:00.000Z',
      stale: false,
      problems: [{ name: 'Client addresses', status: 'degraded', message: 'm', task: 'Check how client addresses are read' }],
    });
    expect(healthTasks(health!.problems).map((t) => t.label)).toEqual(['Check how client addresses are read']);
  });

  it('is null without a stored status', () => {
    expect(healthFromJob(null, new Date(), new Date())).toBeNull();
  });
});
