// src/features/access/permissions.ts

/**
 * The permission catalogue: every permission a role can hold, grouped by admin area.
 *
 * This is the one owner of permission names. API routes, pages, the navigation, the Roles
 * screen and the tests all import from here; nothing else compares role names or permission
 * strings. Safe to import from client code (no server imports).
 *
 * Built-in roles:
 *  - Admin holds every permission, always, including ones added later.
 *  - Editor and Viewer are ordinary roles seeded by the migration with the defaults below;
 *    admins can change them, rename them or delete them.
 */

export const PERMISSION_GROUPS = [
  {
    id: 'experiences',
    label: 'Experiences',
    permissions: [
      { id: 'search-experiences:view', label: 'View search experiences' },
      { id: 'search-experiences:edit', label: 'Create, edit and delete search experiences' },
      { id: 'ai-experiences:view', label: 'View chat experiences' },
      { id: 'ai-experiences:edit', label: 'Create, edit and delete chat experiences' },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    permissions: [
      { id: 'search-indexes:view', label: 'View search indexes and their documents' },
      { id: 'search-indexes:edit', label: 'Create, edit and delete search indexes, fields and mappings' },
      { id: 'documents:edit', label: 'Upload, edit, delete and reindex documents' },
      { id: 'data-sources:view', label: 'View data sources' },
      { id: 'data-sources:edit', label: 'Create, edit and delete data sources' },
    ],
  },
  {
    id: 'ai',
    label: 'AI configuration',
    permissions: [
      { id: 'tools:view', label: 'View tools and MCP connections' },
      { id: 'tools:edit', label: 'Create, edit and delete tools and MCP connections' },
      { id: 'prompts:view', label: 'View prompt templates, knowledge base and domain knowledge' },
      { id: 'prompts:edit', label: 'Edit prompt templates, knowledge base and domain knowledge' },
      { id: 'ai-providers:view', label: 'View AI providers and models (never the keys)' },
      { id: 'ai-providers:manage', label: 'Add, edit and delete AI providers, models and keys' },
    ],
  },
  {
    id: 'usage',
    label: 'Testing and analytics',
    permissions: [
      { id: 'playground:use', label: 'Use the playgrounds and test buttons (spends AI tokens)' },
      { id: 'analytics:view', label: 'View analytics, conversations and traces' },
      { id: 'analytics:ask', label: 'Ask the analytics assistant (spends AI tokens)' },
      { id: 'analytics:manage', label: 'Change analytics and tracing settings, clear data' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    permissions: [
      { id: 'settings:view', label: 'View settings, system defaults and background jobs' },
      { id: 'settings:manage', label: 'Change settings and system defaults, clear caches' },
      { id: 'jobs:run', label: 'Run, cancel and schedule background jobs' },
      { id: 'secrets:manage', label: 'Manage secrets and ingestion keys' },
      { id: 'users:manage', label: 'Manage users and roles' },
      { id: 'setup:run', label: 'Run the demo and docs setup' },
    ],
  },
] as const;

type Group = (typeof PERMISSION_GROUPS)[number];
export type Permission = Group['permissions'][number]['id'];

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.id),
);

const PERMISSION_SET: ReadonlySet<string> = new Set(ALL_PERMISSIONS);

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && PERMISSION_SET.has(value);
}

/** The built-in Admin role's fixed id (seeded by migration 0036). */
export const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000000001';

/** Defaults the migration gives the Editor and Viewer roles; kept here so tests can check them. */
export const EDITOR_DEFAULT_PERMISSIONS: readonly Permission[] = ALL_PERMISSIONS.filter(
  (p) => !['ai-providers:manage', 'jobs:run', 'secrets:manage', 'users:manage', 'setup:run'].includes(p),
);

export const VIEWER_DEFAULT_PERMISSIONS: readonly Permission[] = [
  'search-experiences:view',
  'ai-experiences:view',
  'search-indexes:view',
  'data-sources:view',
  'tools:view',
  'prompts:view',
  'analytics:view',
];
