// src/features/feature-switches/gate.no-rule.test.ts

/**
 * A route no rule covers is let through, and the gate says so in the log. (A test fails for any
 * route on disk without a rule; this is for a path shape that test does not model.)
 */

import { describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@/shared/logger/logger', () => ({ createLogger: () => log }));
vi.mock('server-only', () => ({}));
vi.mock('./feature-switches.service', () => ({ isAreaOn: async () => true }));

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
