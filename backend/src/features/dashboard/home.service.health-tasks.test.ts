// src/features/dashboard/home.service.health-tasks.test.ts

import { describe, expect, it } from 'vitest';

import { healthTasks } from './home.service';

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
