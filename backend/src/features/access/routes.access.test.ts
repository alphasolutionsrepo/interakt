// src/features/access/routes.access.test.ts

/**
 * Every admin API route is gated. The routes are found on disk, so a route added later
 * without a permission fails here.
 *
 *  1. Every exported method of every route.ts outside the public ones carries an access rule
 *     (withPermission), and the full route -> rule table matches the reviewed snapshot.
 *  2. Called without a session, every gated method answers 401; called by a user whose role
 *     has no permissions, every method that needs one answers 403. Neither reaches the
 *     handler: the session and the role lookup are the only stubs, so a handler that ran
 *     would hit its own (unstubbed) dependencies and answer differently.
 *  3. Only the search index document routes accept an ingestion key in place of a session.
 */

import fs from 'fs';
import path from 'path';

import { NextRequest } from 'next/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
// A handler that gets past the gate finds no database, so it can't change anything
vi.mock('@/db/index', () => ({ get db() { throw new Error('no database in this test'); } }));

import type { Permission } from './permissions';
import { acceptsIngestionKey, accessRuleOf, SIGNED_IN, type AccessRule } from './route-guard';

import { AppError } from '@/shared/errors/app-error';

import { accessStub } from '@/shared/test/access-stub';


const API = path.resolve(__dirname, '../../app/api');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/** Routes that authenticate on their own, without a dashboard session. */
const PUBLIC = [/^v1\//, /^auth\/\[\.\.\.nextauth\]$/, /^health\/live$/];
const DOCUMENT_ROUTES = /^search-indexes\/\[id\]\/documents(\/.*)?$/;

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return routeFiles(full);
    return e.name === 'route.ts' ? [full] : [];
  });
}

type RouteMethod = { route: string; method: string; fn: (...args: unknown[]) => Promise<Response>; rule?: AccessRule };

const gated: RouteMethod[] = [];
const ungated: string[] = [];

beforeAll(async () => {
  const files = routeFiles(API)
    .map((f) => path.relative(API, path.dirname(f)).split(path.sep).join('/'))
    .filter((r) => !PUBLIC.some((p) => p.test(r)))
    .sort();
  for (const route of files) {
    const mod = (await import(path.join(API, route, 'route.ts'))) as Record<string, unknown>;
    for (const method of METHODS) {
      const fn = mod[method];
      if (typeof fn !== 'function') continue;
      const rule = accessRuleOf(fn);
      if (!rule) ungated.push(`${method} /api/${route}`);
      else gated.push({ route, method, fn: fn as RouteMethod['fn'], rule });
    }
  }
}, 120_000);

afterEach(() => accessStub.reset());

const call = (r: RouteMethod) =>
  r.fn(
    new NextRequest(`http://localhost/api/${r.route.replace(/\[[^\]]+\]/g, 'x')}`, { method: r.method }),
    { params: Promise.resolve(new Proxy({}, { get: () => 'x' })) },
  );

describe('every admin API route is gated', () => {
  it('finds the admin routes', () => {
    expect(gated.length).toBeGreaterThan(240);
  });

  it('gives every exported method of every non-public route a permission', () => {
    expect(ungated).toEqual([]);
  });

  it('matches the reviewed route -> permission table', async () => {
    const ruleText = (rule: AccessRule) => (typeof rule === 'string' ? rule : `any of ${rule.join(' | ')}`);
    const table = gated.map((r) => `${r.method.padEnd(6)} /api/${r.route}  ${ruleText(r.rule!)}`).join('\n');
    await expect(table + '\n').toMatchFileSnapshot('./__snapshots__/route-permissions.txt');
  });

  it('answers 401 to a caller with no session, on every gated method', async () => {
    accessStub.session = null;
    const wrong: string[] = [];
    for (const r of gated) {
      const res = await call(r);
      if (res.status !== 401) wrong.push(`${r.method} /api/${r.route} -> ${res.status}`);
    }
    expect(wrong).toEqual([]);
  });

  it('answers 401 to a signed-in user who was deactivated or deleted since signing in', async () => {
    accessStub.access = null; // resolveAccess finds no active user
    const wrong: string[] = [];
    for (const r of gated) {
      const res = await call(r);
      if (res.status !== 401) wrong.push(`${r.method} /api/${r.route} -> ${res.status}`);
    }
    expect(wrong).toEqual([]);
  });

  it('answers 403 to a role without the permission, on every method that needs one', async () => {
    accessStub.access = { userId: 'u', roleId: 'r', roleName: 'Nothing', isAdmin: false, permissions: new Set() };
    const wrong: string[] = [];
    for (const r of gated.filter((g) => g.rule !== SIGNED_IN)) {
      const res = await call(r);
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      if (res.status !== 403 || body.code !== 'FORBIDDEN') wrong.push(`${r.method} /api/${r.route} -> ${res.status}`);
    }
    expect(wrong).toEqual([]);
  });

  it('answers a failed permission check as an error, without running the handler', async () => {
    accessStub.error = new AppError('The database couldn\'t be reached.', { code: 'DATABASE_UNAVAILABLE', status: 503 });
    const wrong: string[] = [];
    for (const r of gated) {
      const res = await call(r);
      const body = (await res.json().catch(() => ({}))) as { code?: string; requestId?: string };
      if (res.status !== 503 || body.code !== 'DATABASE_UNAVAILABLE' || !body.requestId) wrong.push(`${r.method} /api/${r.route} -> ${res.status}`);
    }
    expect(wrong).toEqual([]);
  });

  it('lets a role holding exactly the permission past the gate, for every option of an any-of rule', async () => {
    const GATE_REFUSAL = /^Your role doesn't allow this/;
    const wrong: string[] = [];
    for (const r of gated.filter((g) => g.rule !== SIGNED_IN)) {
      const options = (typeof r.rule === 'string' ? [r.rule] : [...r.rule!]) as Permission[];
      for (const permission of options) {
        accessStub.access = { userId: 'u', roleId: 'r', roleName: 'One', isAdmin: false, permissions: new Set<Permission>([permission]) };
        const res = await Promise.race([call(r), new Promise<null>((done) => setTimeout(() => done(null), 3000))]);
        if (!res) continue; // still working after the gate: it let the request through
        const body = (await res.clone().json().catch(() => ({}))) as { message?: string };
        if (res.status === 401 || (res.status === 403 && GATE_REFUSAL.test(body.message ?? ''))) {
          wrong.push(`${r.method} /api/${r.route} with ${permission} -> ${res.status}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  }, 300_000);

  it('lets only the search index document routes accept an ingestion key instead of a session', () => {
    const keyRoutes = gated.filter((r) => acceptsIngestionKey(r.fn)).map((r) => r.route);
    expect(keyRoutes.length).toBeGreaterThan(0);
    expect(keyRoutes.filter((r) => !DOCUMENT_ROUTES.test(r))).toEqual([]);
    const documentRoutes = gated.filter((r) => DOCUMENT_ROUTES.test(r.route));
    expect(documentRoutes.filter((r) => !acceptsIngestionKey(r.fn)).map((r) => `${r.method} ${r.route}`)).toEqual([]);
  });
});
