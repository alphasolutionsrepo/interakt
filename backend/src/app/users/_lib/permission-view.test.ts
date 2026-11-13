// src/app/users/_lib/permission-view.test.ts

import { describe, expect, it } from 'vitest';

import { permissionCount, rolePermissionsToSave, unmetNeeds, viewGroups } from './permission-view';

import { ALL_PERMISSIONS, PERMISSION_GROUPS } from '@/features/access/permissions';
import type { Area } from '@/features/feature-switches/areas';

const off = (...areas: Area[]) => (a: Area) => !areas.includes(a);

describe('viewGroups', () => {
  it('lists every permission of every group, whatever is off', () => {
    const groups = viewGroups(PERMISSION_GROUPS, off('chat', 'search'), new Set());
    expect(groups.flatMap((g) => g.rows).map((r) => r.id)).toEqual(ALL_PERMISSIONS);
  });

  it('disables a row whose area is off, naming the area, and leaves the rest enabled', () => {
    const rows = viewGroups(PERMISSION_GROUPS, off('chat'), new Set()).flatMap((g) => g.rows);
    expect(rows.find((r) => r.id === 'tools:view')).toMatchObject({ disabled: true, disabledArea: 'chat' });
    expect(rows.find((r) => r.id === 'ai-experiences:view')).toMatchObject({ disabled: true, disabledArea: 'chat' });
    expect(rows.find((r) => r.id === 'search-experiences:view')).toMatchObject({ disabled: false, disabledArea: null });
    expect(rows.find((r) => r.id === 'users:manage')).toMatchObject({ disabled: false, disabledArea: null });
  });

  it('keeps the held state of a disabled row', () => {
    const rows = viewGroups(PERMISSION_GROUPS, off('chat'), new Set(['tools:view'])).flatMap((g) => g.rows);
    expect(rows.find((r) => r.id === 'tools:view')).toMatchObject({ held: true, disabled: true });
  });

  it('notes each off area once per group that has one of its permissions', () => {
    const groups = viewGroups(PERMISSION_GROUPS, off('chat', 'search'), new Set());
    for (const g of groups) {
      const areas = g.rows.map((r) => r.disabledArea).filter((a) => a !== null);
      expect(g.offAreas).toEqual([...new Set(areas)]);
    }
    expect(groups.some((g) => g.offAreas.includes('chat'))).toBe(true);
  });

  it('has no notes and no disabled rows when every area is on', () => {
    const groups = viewGroups(PERMISSION_GROUPS, () => true, new Set());
    expect(groups.every((g) => g.offAreas.length === 0 && g.rows.every((r) => !r.disabled))).toBe(true);
  });
});

describe('rolePermissionsToSave', () => {
  it('keeps every held permission, including those of an off area', () => {
    expect(rolePermissionsToSave(new Set(['tools:view', 'users:manage']))).toEqual(['tools:view', 'users:manage']);
  });
});

describe('permissionCount', () => {
  it('counts every held permission, off areas included, out of the real total', () => {
    expect(permissionCount({ isBuiltIn: false, permissions: ['tools:view'] })).toEqual({ held: 1, total: ALL_PERMISSIONS.length });
  });

  it('counts what a permission implies, once', () => {
    // tools:edit brings tools:view; search-indexes:view is held already
    expect(permissionCount({ isBuiltIn: false, permissions: ['search-indexes:view', 'tools:edit'] }).held).toBe(3);
  });

  it('gives a built-in role everything, whatever its stored list', () => {
    expect(permissionCount({ isBuiltIn: true, permissions: [] })).toEqual({ held: ALL_PERMISSIONS.length, total: ALL_PERMISSIONS.length });
  });
});

describe('unmetNeeds', () => {
  it('splits what a ticked permission still needs into tickable and in a turned-off area', () => {
    expect(unmetNeeds(['setup:run'], 'setup:run', off('chat'))).toEqual({
      missing: [
        'ai-providers:manage', 'settings:manage', 'search-indexes:edit', 'documents:edit',
        'search-experiences:edit', 'ai-experiences:edit', 'tools:edit', 'data-sources:edit', 'prompts:edit',
      ],
      tickable: ['ai-providers:manage', 'settings:manage', 'search-indexes:edit', 'documents:edit', 'search-experiences:edit', 'data-sources:edit'],
      blocked: ['ai-experiences:edit', 'tools:edit', 'prompts:edit'],
      blockedAreas: ['chat'],
    });
  });

  it('drops what the role already holds from the needs', () => {
    const needs = unmetNeeds(['setup:run', 'tools:edit', 'settings:manage'], 'setup:run', off('chat'));
    expect(needs.missing).not.toContain('tools:edit');
    expect(needs.missing).not.toContain('settings:manage');
    expect(needs.blocked).toEqual(['ai-experiences:edit', 'prompts:edit']);
  });

  it('has nothing blocked when every area is on, all of it tickable', () => {
    const needs = unmetNeeds(['setup:run'], 'setup:run', () => true);
    expect(needs.blocked).toEqual([]);
    expect(needs.blockedAreas).toEqual([]);
    expect(needs.tickable).toEqual(needs.missing);
    expect(needs.missing).toHaveLength(9);
  });

  it('needs nothing for a permission that requires nothing', () => {
    expect(unmetNeeds([], 'tools:view', () => true)).toEqual({ missing: [], tickable: [], blocked: [], blockedAreas: [] });
  });
});
