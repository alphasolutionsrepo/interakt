// src/features/access/ui-actions.ts

/**
 * What each admin UI control does, the API routes it calls, and so the permission it needs.
 *
 * Components ask about an action (useAccess().canDo / <Can action>), never a permission
 * string, so the button and the server can't drift apart: ui-actions.test.ts checks every
 * entry against the server's rule for each of its routes (the route-permissions snapshot).
 * Which roles hold the permission is the server's business; nothing here knows about roles.
 *
 * Safe to import from client code.
 */

import { holdsAny, type Permission } from './permissions';

interface UiAction {
  /** What it does, to finish "You don't have permission to ..." on a locked control */
  does: string;
  /** Any one is enough; must be exactly the rule on every route listed */
  permission: Permission | readonly Permission[];
  /** "METHOD /api/path" as the route-permissions snapshot writes it */
  routes: readonly string[];
}

export const UI_ACTIONS = {
  // AI providers page
  'ai-providers.add': { does: 'add AI providers', permission: 'ai-providers:manage', routes: ['POST /api/ai-providers'] },
  'ai-providers.edit': { does: 'edit AI providers', permission: 'ai-providers:manage', routes: ['PUT /api/ai-providers/[id]'] },
  'ai-providers.delete': { does: 'delete AI providers', permission: 'ai-providers:manage', routes: ['DELETE /api/ai-providers/[id]'] },
  'ai-providers.enable': {
    does: 'turn AI providers on or off', permission: 'ai-providers:manage',
    routes: ['PATCH /api/ai-providers/[id]/enable', 'PATCH /api/ai-providers/[id]/disable'],
  },
  'ai-providers.test': { does: 'test AI provider connections', permission: 'ai-providers:manage', routes: ['POST /api/ai-providers/[id]/test-connection'] },
  'ai-providers.discover-models': { does: 'discover models', permission: 'ai-providers:manage', routes: ['POST /api/ai-providers/[id]/discover-models'] },
  'ai-models.change': {
    does: 'change models', permission: 'ai-providers:manage',
    routes: ['POST /api/ai-provider-models', 'PUT /api/ai-provider-models/[id]', 'DELETE /api/ai-provider-models/[id]'],
  },
  'system-defaults.save': { does: 'change the system default models', permission: 'settings:manage', routes: ['PUT /api/system-defaults/ai', 'PUT /api/system-defaults/ai/[purpose]'] },

  // Search indexes
  'search-indexes.create': { does: 'create search indexes', permission: 'search-indexes:edit', routes: ['POST /api/search-indexes'] },
  'search-indexes.import': { does: 'import search indexes', permission: 'search-indexes:edit', routes: ['POST /api/search-indexes/import'] },
  'search-indexes.edit': { does: 'edit search indexes', permission: 'search-indexes:edit', routes: ['PUT /api/search-indexes/[id]'] },
  'search-indexes.delete': { does: 'delete search indexes', permission: 'search-indexes:edit', routes: ['DELETE /api/search-indexes/[id]'] },
  'search-indexes.activate': {
    does: 'activate or deactivate search indexes', permission: 'search-indexes:edit',
    routes: ['PATCH /api/search-indexes/[id]/activate', 'PATCH /api/search-indexes/[id]/deactivate'],
  },

  // Documents in a search index
  'documents.upload': {
    does: 'upload documents', permission: 'documents:edit',
    routes: ['POST /api/search-indexes/[id]/documents', 'POST /api/search-indexes/[id]/documents/bulk'],
  },
  'documents.change': {
    does: 'edit or delete documents', permission: 'documents:edit',
    routes: [
      'PUT /api/search-indexes/[id]/documents/[documentId]', 'PATCH /api/search-indexes/[id]/documents/[documentId]',
      'DELETE /api/search-indexes/[id]/documents/[documentId]', 'DELETE /api/search-indexes/[id]/documents/batches/[batchId]',
      'POST /api/search-indexes/[id]/documents/delete-by-filter',
    ],
  },
  'documents.reindex': {
    does: 'reindex or recreate search indexes', permission: 'documents:edit',
    routes: ['POST /api/search-indexes/[id]/reindex', 'POST /api/search-indexes/[id]/recreate-index'],
  },

  // Data sources
  'data-sources.create': { does: 'create data sources', permission: 'data-sources:edit', routes: ['POST /api/data-sources'] },
  'data-sources.edit': { does: 'edit data sources', permission: 'data-sources:edit', routes: ['PUT /api/data-sources/[id]'] },
  'data-sources.delete': { does: 'delete data sources', permission: 'data-sources:edit', routes: ['DELETE /api/data-sources/[id]'] },
  // Contacts the external service, like a playground test
  'data-sources.health-check': { does: 'run data source health checks', permission: 'playground:use', routes: ['POST /api/data-sources/[id]/health'] },

  // Tools
  'tools.scaffold': { does: 'create tools', permission: 'tools:edit', routes: ['POST /api/tools/scaffold'] },
} as const satisfies Record<string, UiAction>;

export type UiActionId = keyof typeof UI_ACTIONS;

/** Why the action is locked for someone without its permission. Names no role: a user may hold several. */
export function lockReason(action: UiActionId): string {
  return `You don't have permission to ${UI_ACTIONS[action].does}. Ask an Admin if you need it.`;
}

/** True when a holder of these permissions may take the action. */
export function allowsAction(can: (p: Permission) => boolean, action: UiActionId): boolean {
  return holdsAny(can, UI_ACTIONS[action].permission);
}
