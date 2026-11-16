// src/app/health/_lib/services.test.ts

import { describe, expect, it } from 'vitest';

import type { ServiceHealth } from './api-client';
import { averageResponseTime, groupServices, lookupByName, showsFullMessage } from './services';

const svc = (name: string, extra: Partial<ServiceHealth> = {}): ServiceHealth => ({
  name,
  status: 'healthy',
  responseTime: 10,
  lastChecked: '2026-01-01T00:00:00Z',
  ...extra,
});

describe('groupServices', () => {
  const all = [
    svc('AI Providers'),
    svc('Database (PostgreSQL)'),
    svc('Search Provider (elasticsearch)'),
    svc('Client addresses', { configOnly: true, responseTime: 0 }),
    svc('Memory'),
    svc('Some New Check'),
  ];

  it('never drops a service', () => {
    const g = groupServices(all);
    expect(g.primary.length + g.infrastructure.length + g.setup.length).toBe(all.length);
    expect(g.infrastructure.map(s => s.name)).toContain('Some New Check');
  });

  it('puts the search engine check in infrastructure', () => {
    expect(groupServices(all).infrastructure.map(s => s.name)).toContain('Search Provider (elasticsearch)');
  });

  it('puts config-only checks in setup and AI Providers in primary', () => {
    const g = groupServices(all);
    expect(g.setup.map(s => s.name)).toEqual(['Client addresses']);
    expect(g.primary.map(s => s.name)).toEqual(['AI Providers']);
  });
});

describe('averageResponseTime', () => {
  it('ignores config-only services', () => {
    const list = [svc('A', { responseTime: 100 }), svc('B', { responseTime: 200 }), svc('C', { configOnly: true, responseTime: 0 })];
    expect(averageResponseTime(list)).toBe(150);
  });

  it('is 0 when nothing is timed', () => {
    expect(averageResponseTime([])).toBe(0);
    expect(averageResponseTime([svc('C', { configOnly: true, responseTime: 0 })])).toBe(0);
  });
});

describe('lookupByName', () => {
  const map = { 'Search Provider': 1, Memory: 2 };
  it('matches exact and Search Provider prefix', () => {
    expect(lookupByName(map, 'Memory')).toBe(2);
    expect(lookupByName(map, 'Search Provider (elasticsearch)')).toBe(1);
    expect(lookupByName(map, 'Search Provider')).toBe(1);
    expect(lookupByName(map, 'Other')).toBeUndefined();
  });
});

describe('showsFullMessage', () => {
  it('is true for config-only checks, healthy or not', () => {
    expect(showsFullMessage(svc('Client addresses', { configOnly: true, status: 'healthy' }))).toBe(true);
    expect(showsFullMessage(svc('Client addresses', { configOnly: true, status: 'degraded' }))).toBe(true);
  });

  it('is true for unhealthy checks, false for healthy timed ones', () => {
    expect(showsFullMessage(svc('A', { status: 'unhealthy' }))).toBe(true);
    expect(showsFullMessage(svc('A', { status: 'healthy' }))).toBe(false);
  });
});
