// src/features/feature-switches/gate.no-rule.test.ts

/**
 * A route no rule covers is refused (fail closed) with a plain 404, and the gate says so in the
 * log. (A test fails for any route on disk without a rule; this is for a path shape that test
 * does not model.) Also: a public route that answers without asking for its area is refused
 * once its area is off.
 */

import { describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@/shared/logger/logger', () => ({ createLogger: () => log }));
vi.mock('server-only', () => ({}));
const off = vi.hoisted(() => new Set<string>());
vi.mock('./feature-switches.service', () => ({ isAreaOn: async (area: string) => !off.has(area), offByDeployment: () => false }));

import { TURNED_OFF_CODE } from './areas';
import { publicApiRoute, refuseExperienceIfOff, refuseIfRouteOff } from './gate';

const NO_RULE = 'No feature area for this route; the request is refused';

describe('the route gate', () => {
  it('refuses a path no rule covers with a plain 404, and logs it', async () => {
    log.warn.mockClear();
    const request = { method: 'GET', nextUrl: { pathname: '/api/not-a-route-anyone-knows' }, url: 'http://localhost/api/not-a-route-anyone-knows' };
    const response = await refuseIfRouteOff(request);
    expect(response?.status).toBe(404);
    expect(await response?.json()).toMatchObject({ code: 'NOT_FOUND' });
    expect(log.warn).toHaveBeenCalledWith(NO_RULE, { pathname: '/api/not-a-route-anyone-knows', method: 'GET' });
  });

  it('refuses a public path no rule covers, once the caller is known, with a plain 404', async () => {
    log.warn.mockClear();
    const request = { method: 'POST', url: 'http://localhost/api/v1/not-a-route-anyone-knows' };
    const response = await refuseExperienceIfOff(request, { isBuiltIn: false });
    expect(response?.status).toBe(404);
    expect(await response?.json()).toMatchObject({ code: 'NOT_FOUND' });
    expect(log.warn).toHaveBeenCalledWith(NO_RULE, { pathname: '/api/v1/not-a-route-anyone-knows', method: 'POST' });
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
      expect(log.warn).not.toHaveBeenCalledWith(NO_RULE, expect.anything());
    } finally {
      off.clear();
    }
  });
});

describe('a public route that answers without asking for its area', () => {
  // Every /api/v1 route asks once it knows the caller (routes.access.test.ts); this is the net
  // for one that doesn't
  const unchecked = publicApiRoute(async (_request: unknown) => new Response('ok', { status: 200 }));
  const request = { method: 'POST', url: 'http://localhost/api/v1/search' };

  it('is refused "turned off" while its area is off, and logged as an error', async () => {
    off.add('search');
    off.add('help-assistant');
    log.error.mockClear();
    try {
      const response = await unchecked(request);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: TURNED_OFF_CODE });
      expect(log.error).toHaveBeenCalledWith('A public route answered without checking its feature area', { pathname: '/api/v1/search', method: 'POST' });
    } finally {
      off.clear();
    }
  });

  it('is left as it answered with the Help assistant on while its own area is off (built-in help uses the same route)', async () => {
    off.add('search');
    log.error.mockClear();
    try {
      expect((await unchecked(request)).status).toBe(200);
      expect(log.error).toHaveBeenCalledWith('A public route answered without checking its feature area', { pathname: '/api/v1/search', method: 'POST' });
    } finally {
      off.clear();
    }
  });

  it('is left as it answered with the Help assistant off while its own area is on', async () => {
    off.add('help-assistant');
    try {
      expect((await unchecked(request)).status).toBe(200);
    } finally {
      off.clear();
    }
  });

  it('answers as it did while its area is on', async () => {
    expect((await unchecked(request)).status).toBe(200);
  });

  it('is not second-guessed when it asked', async () => {
    off.add('search');
    log.error.mockClear();
    try {
      const asked = publicApiRoute(async (req: unknown) => (await refuseExperienceIfOff(req, { isBuiltIn: true })) ?? new Response('ok', { status: 200 }));
      expect((await asked(request)).status).toBe(200);
      expect(log.error).not.toHaveBeenCalled();
    } finally {
      off.clear();
    }
  });
});
