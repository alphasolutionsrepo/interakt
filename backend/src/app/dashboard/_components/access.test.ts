// src/app/dashboard/_components/access.test.ts

/**
 * Home: dismissing a tip hides it for everyone, so the dismiss button shows locked with the
 * reason for a role without analytics:manage.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { HomeCards } from './HomeCards';

import { controlState } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: () => {} }),
  useMutation: () => ({ mutate: () => {}, isPending: false }),
  useQuery: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/app/analytics/_lib/AskPanelContext', () => ({ useAskPanel: () => ({ canAsk: false, open: () => {} }) }));

const tip = { id: 't1', title: 'Add a synonym', body: 'b', action: { label: 'Open', href: '/x' } };
const home = () => renderToStaticMarkup(createElement(HomeCards, { cards: [], tips: [tip], loading: false }));
const dismiss = { attr: 'aria-label="Dismiss tip: Add a synonym"' };

describe('a home tip', () => {
  it('shows Dismiss locked with the reason for a role without analytics:manage', () => {
    uiAccess.hold('analytics:view');
    const html = home();
    expect(controlState(html, dismiss)).toBe('locked');
    expect(html).toContain('You don&#x27;t have permission to dismiss tips for everyone.');
  });

  it('lets a role that manages analytics dismiss it', () => {
    uiAccess.hold('analytics:view', 'analytics:manage');
    expect(controlState(home(), dismiss)).toBe('open');
  });
});
