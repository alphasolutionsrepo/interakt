// src/features/feature-switches/permission-areas.test.ts

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Area } from './areas';
import { offPermissionAreas, permissionAreas } from './permission-areas';
import { routeArea } from './route-areas';

import { ALL_PERMISSIONS, type Permission } from '@/features/access/permissions';

describe('which area a permission belongs to', () => {
  it('maps each permission to its area', () => {
    expect(permissionAreas('search-experiences:edit')).toEqual(['search']);
    expect(permissionAreas('ai-experiences:view')).toEqual(['chat']);
    expect(permissionAreas('tools:edit')).toEqual(['chat']);
    expect(permissionAreas('prompts:view')).toEqual(['chat', 'managed-indexes']);
    expect(permissionAreas('prompts:edit')).toEqual(['chat', 'managed-indexes']);
    expect(permissionAreas('search-indexes:view')).toEqual(['managed-indexes']);
    expect(permissionAreas('documents:edit')).toEqual(['managed-indexes']);
    expect(permissionAreas('playground:use')).toEqual(['playground', 'chat', 'ai-summaries']);
    expect(permissionAreas('analytics:ask')).toEqual(['analytics']);
    expect(permissionAreas('analytics:manage')).toEqual(['analytics']);
  });

  it('leaves core permissions without an area', () => {
    for (const p of ['data-sources:view', 'ai-providers:manage', 'settings:view', 'users:manage', 'secrets:manage', 'setup:run', 'jobs:run'] as const) {
      expect(permissionAreas(p)).toEqual([]);
    }
  });

  it('lists the exact area (or none) of every permission', () => {
    const EXPECTED: Record<Permission, readonly Area[]> = {
      'search-experiences:view': ['search'],
      'search-experiences:edit': ['search'],
      'ai-experiences:view': ['chat'],
      'ai-experiences:edit': ['chat'],
      'search-indexes:view': ['managed-indexes'],
      'search-indexes:edit': ['managed-indexes'],
      'documents:edit': ['managed-indexes'],
      'data-sources:view': [],
      'data-sources:edit': [],
      'tools:view': ['chat'],
      'tools:edit': ['chat'],
      'prompts:view': ['chat', 'managed-indexes'],
      'prompts:edit': ['chat', 'managed-indexes'],
      'ai-providers:view': [],
      'ai-providers:manage': [],
      'playground:use': ['playground', 'chat', 'ai-summaries'],
      'analytics:view': ['analytics'],
      'analytics:ask': ['analytics'],
      'analytics:manage': ['analytics'],
      'settings:view': [],
      'settings:manage': [],
      'jobs:run': [],
      'secrets:manage': [],
      'users:manage': [],
      'setup:run': [],
    };
    // A new permission has no entry (tsc and the next line fail) until its area is decided here
    expect([...ALL_PERMISSIONS].sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const p of ALL_PERMISSIONS) expect(permissionAreas(p), p).toEqual(EXPECTED[p]);
  });
});

describe('greying out by area', () => {
  const on = (...off: Area[]) => (a: Area) => !off.includes(a);

  it('disables a permission only when all of its areas are off', () => {
    expect(offPermissionAreas('prompts:edit', on('chat'))).toEqual([]);
    expect(offPermissionAreas('prompts:edit', on('managed-indexes'))).toEqual([]);
    expect(offPermissionAreas('prompts:edit', on('chat', 'managed-indexes'))).toEqual(['chat', 'managed-indexes']);
    expect(offPermissionAreas('tools:edit', on('chat'))).toEqual(['chat']);
    expect(offPermissionAreas('users:manage', on('chat'))).toEqual([]);
  });
});

/**
 * The map against the routes, so a mismatch fails: the snapshot lists every route with the one
 * permission it needs and its area(s); route-areas.ts is checked against it too.
 */
describe('permission areas match the routes', () => {
  type Line = { method: string; route: string; permission: string; areas: Area[] };
  const lines: Line[] = readFileSync(path.join(__dirname, '../access/__snapshots__/route-permissions.txt'), 'utf8')
    .split('\n')
    .flatMap((raw) => {
      const m = /^(\S+)\s+(\S+)\s+(\S+)(?:\s+\+built-in)?\s+\[([^\]]*)\]\s*$/.exec(raw);
      // Lines with "any of a | b" don't match (a route any of several permissions opens belongs to none of them)
      if (!m || m[3] === 'any' || m[3] === 'signed-in') return [];
      return [{ method: m[1], route: m[2], permission: m[3], areas: m[4] === 'core' ? [] : (m[4].split(' + ') as Area[]) }];
    });

  it('has parsed the snapshot', () => {
    expect(lines.length).toBeGreaterThan(100);
  });

  it('agrees with route-areas.ts on every route in the snapshot', () => {
    for (const l of lines) {
      const concrete = l.route.replace(/\[\.\.\.[^\]]+\]/g, 'x/y').replace(/\[[^\]]+\]/g, 'x');
      expect([...(routeArea(concrete, l.method)?.areas ?? [])].sort(), `${l.method} ${l.route}`).toEqual([...l.areas].sort());
    }
  });

  // Permissions that also open core routes (always on) are listed where their feature lives, or as
  // core: greying them out only stops new grants. Anything else must list every area it opens.
  const HAS_CORE_ROUTES = new Set(lines.filter((l) => l.areas.length === 0).map((l) => l.permission));

  it('lists, for every permission, every area one of its routes needs', () => {
    for (const p of ALL_PERMISSIONS) {
      const mine = lines.filter((l) => l.permission === p && l.areas.length > 0);
      // A route that needs two areas works only with both on, so each of its areas counts
      const routeAreas = new Set(mine.flatMap((l) => l.areas));
      const mapped = new Set(permissionAreas(p));
      const single = new Set(mine.filter((l) => l.areas.length === 1).flatMap((l) => l.areas));
      for (const a of mapped) expect(routeAreas.has(a), `${p} lists ${a}, which no route of it needs`).toBe(true);
      if (!HAS_CORE_ROUTES.has(p)) {
        for (const a of routeAreas) expect(mapped.has(a), `${p} has a route in ${a}, missing from its areas`).toBe(true);
      } else if (mapped.size > 0) {
        for (const a of single) expect(mapped.has(a), `${p} has a route in ${a}, missing from its areas`).toBe(true);
      }
    }
  });
});
