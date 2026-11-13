// src/features/feature-switches/permission-areas.test.ts

import { describe, expect, it } from 'vitest';

import type { Area } from './areas';
import { permissionArea } from './permission-areas';

import { ALL_PERMISSIONS, type Permission } from '@/features/access/permissions';

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

  it('lists the exact area (or none) of every permission', () => {
    const EXPECTED: Record<Permission, Area | null> = {
      'search-experiences:view': 'search',
      'search-experiences:edit': 'search',
      'ai-experiences:view': 'chat',
      'ai-experiences:edit': 'chat',
      'search-indexes:view': 'managed-indexes',
      'search-indexes:edit': 'managed-indexes',
      'documents:edit': 'managed-indexes',
      'data-sources:view': null,
      'data-sources:edit': null,
      'tools:view': 'chat',
      'tools:edit': 'chat',
      'prompts:view': 'chat',
      'prompts:edit': 'chat',
      'ai-providers:view': null,
      'ai-providers:manage': null,
      'playground:use': 'playground',
      'analytics:view': 'analytics',
      'analytics:ask': 'analytics',
      'analytics:manage': 'analytics',
      'settings:view': null,
      'settings:manage': null,
      'jobs:run': null,
      'secrets:manage': null,
      'users:manage': null,
      'setup:run': null,
    };
    // A new permission has no entry (tsc and the next line fail) until its area is decided here
    expect([...ALL_PERMISSIONS].sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const p of ALL_PERMISSIONS) expect(permissionArea(p), p).toBe(EXPECTED[p]);
  });
});
