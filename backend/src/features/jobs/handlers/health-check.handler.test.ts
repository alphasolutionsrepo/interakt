// src/features/jobs/handlers/health-check.handler.test.ts

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/health/health.service', () => ({
  checkSystemHealth: async () => ({
    status: 'degraded',
    timestamp: new Date('2026-11-15T10:00:00Z'),
    uptime: 1,
    services: [
      { name: 'Database (PostgreSQL)', status: 'healthy', responseTime: 3, lastChecked: new Date(), details: { pool: 1 } },
      { name: 'Client addresses', status: 'degraded', responseTime: 0, lastChecked: new Date(), message: 'm', task: 'Check how client addresses are read' },
    ],
  }),
}));

import { healthCheckWorker } from './health-check.handler';

describe('healthCheckWorker', () => {
  it("keeps each service's status, message and task for the home page, and nothing else", async () => {
    expect(await healthCheckWorker()).toEqual({
      status: 'degraded',
      checkedAt: '2026-11-15T10:00:00.000Z',
      services: [
        { name: 'Database (PostgreSQL)', status: 'healthy' },
        { name: 'Client addresses', status: 'degraded', message: 'm', task: 'Check how client addresses are read' },
      ],
    });
  });
});
