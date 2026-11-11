// src/shared/access/ActionControls.test.ts

/**
 * One behaviour for every action control: usable when allowed; locked (disabled, a lock icon,
 * the reason for hover and screen readers) when not; disabled without the lock while access is
 * still loading, so nothing flashes.
 */

import { Plus } from 'lucide-react';
import { createElement } from 'react';
import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCESS_UNAVAILABLE, ActionButton, ActionMenuItem, ActionSwitch, adminGateFor, anyActionGateFor, builtInGateFor, gateFor, useAdminGate, useAnyActionGate } from './ActionControls';

import { allowsAction, type UiActionId } from '@/features/access/ui-actions';
import { lockedMenuReasons } from '@/shared/test/rendered-controls';
import { uiAccess, uiAccessLoading } from '@/shared/test/ui-access-stub';

vi.mock('./useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@/components/ui/dropdown-menu', async () => (await import('@/shared/test/open-overlays-stub')).dropdownMenu);

const REASON = "You don&#x27;t have permission to add AI providers. Ask an Admin if you need it.";
const button = () => renderToStaticMarkup(createElement(ActionButton, { action: 'ai-providers.add', icon: Plus, children: 'Add Provider' }));
const item = () => renderToStaticMarkup(createElement(ActionMenuItem, { action: 'ai-providers.add', icon: Plus, children: 'Add' }));
const toggle = () => renderToStaticMarkup(createElement(ActionSwitch, { action: 'ai-providers.enable', checked: true }));

const access = (held: string[], over: { isLoading?: boolean; isAdmin?: boolean } = {}) => {
  const can = (p: string) => held.includes(p);
  return { isLoading: false, isAdmin: false, canDo: (a: UiActionId) => allowsAction(can as never, a), ...over };
};

describe('gateFor', () => {
  it('allows, locks with the reason, or waits for access', () => {
    expect(gateFor(access(['ai-providers:manage']), 'ai-providers.add')).toEqual({ state: 'allowed' });
    expect(gateFor(access([]), 'ai-providers.add')).toEqual({ state: 'locked', reason: REASON.replace('&#x27;', "'") });
    expect(gateFor(access(['ai-providers:manage'], { isLoading: true }), 'ai-providers.add')).toEqual({ state: 'loading' });
  });
});

describe('when the access lookup failed', () => {
  it("says access couldn't be checked, never that the permission is missing", () => {
    const failed = access(['ai-providers:manage'], {}) as ReturnType<typeof access> & { errorStatus: number };
    failed.errorStatus = 503;
    const unavailable = { state: 'locked', reason: ACCESS_UNAVAILABLE };
    expect(gateFor(failed, 'ai-providers.add')).toEqual(unavailable);
    expect(adminGateFor(failed, 'add roles')).toEqual(unavailable);
    expect(anyActionGateFor(failed, ['ai-experiences.create'], 'create experiences')).toEqual(unavailable);
    expect(builtInGateFor(failed, 'tools.edit', true)).toEqual(unavailable);
  });
});

describe('builtInGateFor', () => {
  const editor = access(['tools:edit']);

  it('locks a change to the built-in help for anyone but an Admin, with the server\'s wording', () => {
    expect(builtInGateFor(editor, 'tools.edit', true)).toEqual({ state: 'locked', reason: 'Only an Admin can change the built-in help.' });
    expect(builtInGateFor(access(['tools:edit'], { isAdmin: true }), 'tools.edit', true)).toEqual({ state: 'allowed' });
  });

  it('leaves other rows to the action\'s own permission', () => {
    expect(builtInGateFor(editor, 'tools.edit', false)).toEqual({ state: 'allowed' });
    expect(builtInGateFor(access([]), 'tools.edit', true).state).toBe('locked');
    expect(builtInGateFor(access([]), 'tools.edit', true)).not.toEqual({ state: 'locked', reason: 'Only an Admin can change the built-in help.' });
  });
});

describe('adminGateFor', () => {
  it('allows only an Admin, and says so', () => {
    expect(adminGateFor(access([], { isAdmin: true }), 'add roles')).toEqual({ state: 'allowed' });
    expect(adminGateFor(access(['users:manage']), 'add roles')).toEqual({ state: 'locked', reason: 'Only an Admin can add roles.' });
  });
});

describe('anyActionGateFor', () => {
  const NEW = ['ai-experiences.create', 'search-experiences.create'] as const;

  it('allows when any one of the actions is allowed', () => {
    expect(anyActionGateFor(access(['ai-experiences:edit']), NEW, 'create experiences')).toEqual({ state: 'allowed' });
    expect(anyActionGateFor(access(['search-experiences:edit']), NEW, 'create experiences')).toEqual({ state: 'allowed' });
  });

  it('locks, naming them together, when none is; waits while access loads', () => {
    expect(anyActionGateFor(access([]), NEW, 'create experiences'))
      .toEqual({ state: 'locked', reason: "You don't have permission to create experiences. Ask an Admin if you need it." });
    expect(anyActionGateFor(access(['ai-experiences:edit'], { isLoading: true }), NEW, 'create experiences')).toEqual({ state: 'loading' });
  });
});

describe('the gate hooks', () => {
  const Probe = ({ use }: { use: () => unknown }) => JSON.stringify(use());
  const run = (use: () => unknown) => JSON.parse(renderToStaticMarkup(createElement(Probe, { use })).replace(/&quot;/g, '"'));

  it('read the signed-in user: Admin-only and any-of', () => {
    uiAccess.hold('users:manage', 'search-experiences:edit');
    expect(run(() => useAdminGate('add roles'))).toEqual({ state: 'locked', reason: 'Only an Admin can add roles.' });
    expect(run(() => useAnyActionGate(['ai-experiences.create', 'search-experiences.create'], 'create experiences'))).toEqual({ state: 'allowed' });
    uiAccess.asAdmin();
    expect(run(() => useAdminGate('add roles'))).toEqual({ state: 'allowed' });
    uiAccessLoading();
    expect(run(() => useAdminGate('add roles'))).toEqual({ state: 'loading' });
  });
});

describe('action controls', () => {
  beforeEach(() => uiAccess.hold());

  it('are usable, with their own icon, when allowed', () => {
    uiAccess.hold('ai-providers:manage');
    for (const html of [button(), item(), toggle()]) {
      expect(html).not.toContain('disabled=""');
      expect(html).not.toContain('data-locked');
    }
    expect(button()).toContain('lucide-plus');
  });

  it('are locked when not allowed: disabled, a lock instead of the icon, and the reason', () => {
    for (const html of [button(), item()]) {
      expect(html).toContain('lucide-lock');
      expect(html).not.toContain('lucide-plus');
      expect(html).toContain(REASON);
    }
    expect(button()).toContain('disabled=""');
    // A locked menu item stays focusable (menus skip disabled items), with its reason read out inside it
    expect(item()).not.toContain('disabled=""');
    expect(item()).toContain('aria-disabled="true"');
    expect(lockedMenuReasons(item())).toEqual([REASON]);
    expect(toggle()).toContain('disabled=""');
    expect(toggle()).toContain('aria-checked="true"'); // the value still shows
    expect(toggle()).toContain('turn AI providers on or off');
  });

  it('a locked menu item does nothing when chosen, and the click goes no further', () => {
    const element = ActionMenuItem({ action: 'ai-providers.add', onClick: () => { throw new Error('ran'); }, children: 'Add' }) as React.ReactElement<{
      onClick: (e: unknown) => void; onSelect: (e: unknown) => void;
    }>;
    for (const handler of [element.props.onClick, element.props.onSelect]) {
      const e = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
      handler(e);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(e.stopPropagation).toHaveBeenCalled();
    }
  });

  it('are disabled without the lock while access is loading', () => {
    uiAccessLoading();
    const html = button();
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('lucide-lock');
    expect(html).not.toContain('data-locked');
  });

  it('lock a built-in row for a non-Admin who holds the permission', () => {
    uiAccess.hold('tools:edit');
    const html = renderToStaticMarkup(createElement(ActionButton, { action: 'tools.edit', builtIn: true, children: 'Edit' }));
    expect(html).toContain('lucide-lock');
    expect(html).toContain('Only an Admin can change the built-in help.');
    uiAccess.asAdmin();
    expect(renderToStaticMarkup(createElement(ActionButton, { action: 'tools.edit', builtIn: true, children: 'Edit' }))).not.toContain('data-locked');
  });

  it('lock a built-in switch for a non-Admin, still showing its value', () => {
    uiAccess.hold('search-indexes:edit');
    const html = renderToStaticMarkup(createElement(ActionSwitch, { action: 'search-indexes.activate', checked: true, builtIn: true }));
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('Only an Admin can change the built-in help.');
  });

  it('stay disabled without the lock while access loads, on a built-in row too', () => {
    uiAccessLoading();
    const html = renderToStaticMarkup(createElement(ActionButton, { action: 'tools.edit', builtIn: true, children: 'Edit' }));
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('data-locked');
  });

  it('stay disabled for their own reason even when allowed', () => {
    uiAccess.hold('ai-providers:manage');
    const html = renderToStaticMarkup(createElement(ActionButton, { action: 'ai-providers.add', disabled: true, children: 'Add' }));
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('data-locked');
  });
});
