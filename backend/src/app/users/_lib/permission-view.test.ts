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
    expect(permissionCount({ isBuiltIn: false, permissions: ['tools:view'] }).total).toBe(ALL_PERMISSIONS.length);
    expect(permissionCount({ isBuiltIn: true, permissions: [] }).held).toBe(ALL_PERMISSIONS.length);
    expect(permissionCount({ isBuiltIn: false, permissions: ['tools:view'] }).held).toBeGreaterThanOrEqual(1);
  });
});

describe('unmetNeeds', () => {
  it('splits what a ticked permission still needs into tickable and in a turned-off area', () => {
    const needs = unmetNeeds(['setup:run'], 'setup:run', off('chat'));
    expect(needs.missing.length).toBeGreaterThan(0);
    expect(needs.blockedAreas).toContain('chat');
    expect(needs.tickable.length + needs.blocked.length).toBe(needs.missing.length);
    expect(needs.blocked.every((p) => ['tools:', 'prompts:', 'ai-experiences:'].some((x) => p.startsWith(x)))).toBe(true);
  });

  it('has nothing blocked when every area is on', () => {
    expect(unmetNeeds(['setup:run'], 'setup:run', () => true).blocked).toEqual([]);
  });
});
