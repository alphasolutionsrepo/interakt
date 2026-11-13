// src/features/feature-switches/gate.no-rule.test.ts

/**
 * A route no rule covers is let through, and the gate says so in the log. (A test fails for any
 * route on disk without a rule; this is for a path shape that test does not model.)
 */

import { describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@/shared/logger/logger', () => ({ createLogger: () => log }));
vi.mock('server-only', () => ({}));
const off = vi.hoisted(() => new Set<string>());
vi.mock('./feature-switches.service', () => ({ isAreaOn: async (area: string) => !off.has(area) }));

import { refuseIfRouteOff } from './gate';

describe('the route gate', () => {
  it('lets a path no rule covers through and logs it', async () => {
    const request = { method: 'GET', nextUrl: { pathname: '/api/not-a-route-anyone-knows' }, url: 'http://localhost/api/not-a-route-anyone-knows' };
    expect(await refuseIfRouteOff(request)).toBeNull();
    expect(log.warn).toHaveBeenCalledWith('No feature area for this route; the request is not checked', expect.objectContaining({ method: 'GET' }));
  });

  it('logs nothing for a route that has a rule', async () => {
    log.warn.mockClear();
    const request = { method: 'GET', nextUrl: { pathname: '/api/ai-experiences' }, url: 'http://localhost/api/ai-experiences' };
    expect(await refuseIfRouteOff(request)).toBeNull();
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe('a line break in a path segment', () => {
  // Percent-encoded, so the decoded path holds the character itself
  it.each([
    ['\\n', '%0A'],
    ['\\r', '%0D'],
    ['U+2028', '%E2%80%A8'],
    ['U+2029', '%E2%80%A9'],
  ])('still matches its rule (%s): a managed index stays closed while Managed indexes is off', async (_name, encoded) => {
    off.add('managed-indexes');
    log.warn.mockClear();
    try {
      const url = `http://localhost/api/search-indexes/idx/documents/a${encoded}b`;
      const response = await refuseIfRouteOff({ method: 'PUT', url });
      expect(response?.status).toBe(404);
      expect(log.warn).not.toHaveBeenCalledWith('No feature area for this route; the request is not checked', expect.anything());
    } finally {
      off.clear();
    }
  });
});
