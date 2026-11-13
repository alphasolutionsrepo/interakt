// src/features/feature-switches/permission-areas.test.ts

import { describe, expect, it } from 'vitest';

import type { Area } from './areas';
import { permissionArea, permissionShown } from './permission-areas';

import { ALL_PERMISSIONS } from '@/features/access/permissions';

describe('which area a permission belongs to', () => {
  it('maps each permission to its area', () => {
    expect(permissionArea('search-experiences:edit')).toBe('search');
    expect(permissionArea('ai-experiences:view')).toBe('chat');
    expect(permissionArea('tools:edit')).toBe('chat');
    expect(permissionArea('prompts:view')).toBe('chat');
    expect(permissionArea('search-indexes:view')).toBe('managed-indexes');
    expect(permissionArea('documents:edit')).toBe('managed-indexes');
    expect(permissionArea('playground:use')).toBe('playground');
    expect(permissionArea('analytics:ask')).toBe('analytics');
    expect(permissionArea('analytics:manage')).toBe('analytics');
  });

  it('leaves core permissions without an area', () => {
    for (const p of ['data-sources:view', 'ai-providers:manage', 'settings:view', 'users:manage', 'secrets:manage', 'setup:run', 'jobs:run'] as const) {
      expect(permissionArea(p)).toBeNull();
    }
  });

  it('knows an area (or none) for every permission', () => {
    for (const p of ALL_PERMISSIONS) expect(permissionArea(p)).not.toBeUndefined();
  });

  it('shows a permission unless its area is off', () => {
    const off = (a: Area) => a !== 'chat';
    expect(permissionShown('tools:view', off)).toBe(false);
    expect(permissionShown('search-experiences:view', off)).toBe(true);
    expect(permissionShown('users:manage', () => false)).toBe(true);
  });
});
