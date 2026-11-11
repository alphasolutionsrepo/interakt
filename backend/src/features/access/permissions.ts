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
      { id: 'analytics:view', label: 'View analytics, conversations, traces and what the assistant remembers about visitors' },
      { id: 'analytics:ask', label: 'Ask the analytics assistant (spends AI tokens)' },
      { id: 'analytics:manage', label: 'Change analytics and tracing settings, clear data and dismiss tips' },
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
      { id: 'users:manage', label: 'Manage users and give them roles within your own' },
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

/** Whether a holder passes a rule of one permission, or any one of a list. */
export function holdsAny(can: (p: Permission) => boolean, rule: Permission | readonly Permission[]): boolean {
  return typeof rule === 'string' ? can(rule) : rule.some(can);
}

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && PERMISSION_SET.has(value);
}

/**
 * Why a change to the built-in help is refused for anyone but an Admin: the server's answer
 * (built-in.ts) and the lock on the admin's controls, one wording.
 */
export const BUILT_IN_REFUSAL = 'Only an Admin can change the built-in help.';

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

/**
 * Who may read the AI provider and model lists (never the keys) and the system default models:
 * besides viewing providers, everyone who picks a model while editing an index or an
 * experience, and those who view settings.
 */
export const AI_MODEL_READERS: readonly Permission[] = [
  'ai-providers:view',
  'search-indexes:edit',
  'search-experiences:edit',
  'ai-experiences:edit',
  'settings:view',
  'playground:use',
  'analytics:ask',
];

/**
 * Permissions that only make sense with another: changing something implies seeing it,
 * asking the analytics assistant reads analytics, the playgrounds read the indexes and
 * experiences they test, and editing an experience reads what its pickers choose from (a chat
 * experience: tools, MCP connections, prompt templates; a search experience: indexes and data
 * sources), never secrets or provider keys. Applied when a role's permissions are read,
 * so no role can hold the first without the second.
 */
export const IMPLIED_PERMISSIONS: Partial<Record<Permission, readonly Permission[]>> = {
  'search-experiences:edit': ['search-experiences:view', 'search-indexes:view', 'data-sources:view'],
  'ai-experiences:edit': ['ai-experiences:view', 'tools:view', 'prompts:view'],
  'search-indexes:edit': ['search-indexes:view'],
  'documents:edit': ['search-indexes:view'],
  'data-sources:edit': ['data-sources:view'],
  'tools:edit': ['tools:view'],
  'prompts:edit': ['prompts:view'],
  'ai-providers:manage': ['ai-providers:view'],
  'analytics:ask': ['analytics:view'],
  'analytics:manage': ['analytics:view'],
  'settings:manage': ['settings:view'],
  'jobs:run': ['settings:view'],
  // The playgrounds pick from the indexes and experiences, so using them includes seeing those
  'playground:use': ['search-indexes:view', 'search-experiences:view', 'ai-experiences:view'],
};

/**
 * Permissions that only take effect alongside others, because what they run does all of those
 * things: the demo and docs setup replaces AI provider keys and system defaults and creates
 * indexes, experiences and tools. A role holding one without the rest doesn't get it.
 */
export const REQUIRED_WITH: Partial<Record<Permission, readonly Permission[]>> = {
  'setup:run': [
    'ai-providers:manage', 'settings:manage', 'search-indexes:edit', 'documents:edit',
    'search-experiences:edit', 'ai-experiences:edit', 'tools:edit', 'data-sources:edit', 'prompts:edit',
  ],
};

/**
 * What a role's stored permissions grant: plus everything they imply, minus any whose required
 * companions are missing (see REQUIRED_WITH).
 */
export function effectivePermissions(permissions: readonly Permission[]): Permission[] {
  const all = new Set<Permission>(permissions);
  for (const p of permissions) for (const implied of IMPLIED_PERMISSIONS[p] ?? []) all.add(implied);
  for (const [p, needs] of Object.entries(REQUIRED_WITH) as Array<[Permission, readonly Permission[]]>) {
    if (all.has(p) && !needs.every((n) => all.has(n))) all.delete(p);
  }
  return [...all];
}

/**
 * Why a caller can't give a role, or manage a user who holds it (mayAssignRole said no). The one
 * wording: the server's refusal and the Users page's lock both use it.
 */
export function roleRefusal(action: 'give' | 'manage', role: { isBuiltIn: boolean }): string {
  if (role.isBuiltIn) return action === 'give' ? 'Only an Admin can give the Admin role.' : 'Only an Admin can manage a user with the Admin role.';
  return action === 'give'
    ? "You can't give a role with permissions your own role doesn't have."
    : "You can't manage a user whose role has permissions your own role doesn't have.";
}

/**
 * Whether a caller may give a role to a user, or manage a user who holds it: every permission the
 * role grants (implied added, unmet left out) must be one the caller holds, so nobody hands out
 * more than they have. Admin holds everything; only Admin holds the built-in Admin role. The one
 * copy of this rule: the server's access-policy.ts and the Users page both use it.
 */
export function mayAssignRole(
  caller: { isAdmin: boolean; permissions: Iterable<string> },
  role: { isBuiltIn: boolean; permissions: readonly string[] },
): boolean {
  if (caller.isAdmin) return true;
  if (role.isBuiltIn) return false;
  // Both sides as granted: caller.permissions already are
  const mine = new Set(caller.permissions);
  return effectivePermissions(role.permissions.filter(isPermission)).every((p) => mine.has(p));
}
