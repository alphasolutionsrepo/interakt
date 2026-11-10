// src/shared/access/ActionControls.test.ts

/**
 * One behaviour for every action control: usable when allowed; locked (disabled, a lock icon,
 * the reason for hover and screen readers) when not; disabled without the lock while access is
 * still loading, so nothing flashes.
 */

import { Plus } from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionButton, ActionMenuItem, ActionSwitch, adminGateFor, gateFor } from './ActionControls';

import { allowsAction, type UiActionId } from '@/features/access/ui-actions';
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

describe('adminGateFor', () => {
  it('allows only an Admin, and says so', () => {
    expect(adminGateFor(access([], { isAdmin: true }), 'add roles')).toEqual({ state: 'allowed' });
    expect(adminGateFor(access(['users:manage']), 'add roles')).toEqual({ state: 'locked', reason: 'Only an Admin can add roles.' });
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
      expect(html).toContain('disabled=""');
      expect(html).toContain('lucide-lock');
      expect(html).not.toContain('lucide-plus');
      expect(html).toContain(REASON);
    }
    expect(toggle()).toContain('disabled=""');
    expect(toggle()).toContain('aria-checked="true"'); // the value still shows
    expect(toggle()).toContain('turn AI providers on or off');
  });

  it('are disabled without the lock while access is loading', () => {
    uiAccessLoading();
    const html = button();
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('lucide-lock');
    expect(html).not.toContain('data-locked');
  });

  it('stay disabled for their own reason even when allowed', () => {
    uiAccess.hold('ai-providers:manage');
    const html = renderToStaticMarkup(createElement(ActionButton, { action: 'ai-providers.add', disabled: true, children: 'Add' }));
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('data-locked');
  });
});
