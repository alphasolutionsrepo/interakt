// src/features/access/ui-actions.test.ts

/**
 * Every UI action asks for exactly what the server checks on the routes it calls, so a button
 * never shows to a role the server refuses, nor hides from one it allows. The server's rules
 * come from the route-permissions snapshot, which routes.access.test.ts keeps in step with
 * every route file.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Permission } from './permissions';
import { allowsAction, UI_ACTIONS } from './ui-actions';

const SNAPSHOT = join(__dirname, '__snapshots__', 'route-permissions.txt');

/** "METHOD /api/path" -> the rule as the snapshot writes it */
const serverRules = new Map(
  readFileSync(SNAPSHOT, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [method, path, ...rule] = line.trim().split(/\s+/);
      return [`${method} ${path}`, rule.join(' ')] as const;
    }),
);

const asRule = (permission: Permission | readonly Permission[]) =>
  typeof permission === 'string' ? permission : `any of ${permission.join(' | ')}`;

describe('UI actions', () => {
  it.each(Object.entries(UI_ACTIONS))('%s needs what the server checks on each of its routes', (_id, action) => {
    const checkedIn = 'checkedIn' in action ? action.checkedIn : undefined;
    expect(action.routes.length > 0 || !!checkedIn, 'an action names its routes, or the file that checks it').toBe(true);
    if (checkedIn) {
      // A public route checks the permission in code: that file must ask for exactly it
      expect(readFileSync(join(__dirname, '..', '..', '..', checkedIn), 'utf8')).toContain(`'${asRule(action.permission)}'`);
    }
    for (const route of action.routes) {
      expect(serverRules.has(route), `${route} is not an API route`).toBe(true);
      expect(serverRules.get(route), route).toBe(asRule(action.permission));
    }
  });

  it('allows an action only with its permission', () => {
    const holding = (...held: Permission[]) => (p: Permission) => held.includes(p);
    expect(allowsAction(holding('ai-providers:manage'), 'ai-providers.add')).toBe(true);
    expect(allowsAction(holding('ai-providers:view'), 'ai-providers.add')).toBe(false);
    expect(allowsAction(holding('ai-providers:manage'), 'system-defaults.save')).toBe(false);
  });
});
