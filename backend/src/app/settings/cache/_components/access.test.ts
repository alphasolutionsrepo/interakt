// src/app/settings/cache/_components/access.test.ts

/**
 * The cache page's Clear All Caches: locked with the reason for a role that can't manage
 * settings, and then only the button, so a click on the lock can't open the confirmation.
 * Open, and wired to its confirmation, for a role that can.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import CachePage from '../page';

import { controlState } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => '/settings/cache' }));
// The confirmation renders inline, so the test can see whether it is there at all
vi.mock('@/components/ui/alert-dialog', async () => {
  const { createElement: h } = await import('react');
  const tag = (name: string) => ({ children }: { children?: unknown }) => h('div', { 'data-part': name }, children as never);
  return {
    AlertDialog: tag('dialog'), AlertDialogTrigger: ({ children }: { children?: unknown }) => children,
    AlertDialogContent: tag('content'), AlertDialogHeader: tag('header'), AlertDialogTitle: tag('title'),
    AlertDialogDescription: tag('description'), AlertDialogFooter: tag('footer'),
    AlertDialogCancel: tag('cancel'), AlertDialogAction: tag('action'),
  };
});
vi.mock('../_lib/hooks/useCacheManagement', () => ({
  useCacheManagement: () => ({
    stats: [], aggregateStats: { totalEntries: 12, totalHits: 0, totalMisses: 0, hitRate: 0 },
    isLoading: false, isError: false, error: null, refetch: () => {},
    clearCache: () => {}, clearAllCaches: () => {}, isClearingCache: false, isClearingAllCaches: false, clearingFeatureId: undefined,
  }),
}));

const page = () => renderToStaticMarkup(createElement(CachePage));

describe('Clear All Caches', () => {
  it('is locked with the reason, and has no confirmation to open, for a settings viewer', () => {
    uiAccess.hold('settings:view');
    const html = page();
    expect(controlState(html, { text: 'Clear All Caches' })).toBe('locked');
    expect(html).toContain('You don&#x27;t have permission to clear caches.');
    expect(html).not.toContain('data-part="dialog"');
  });

  it('opens its confirmation for a role that manages settings', () => {
    uiAccess.hold('settings:view', 'settings:manage');
    const html = page();
    expect(controlState(html, { text: 'Clear All Caches' })).toBe('open');
    expect(html).toContain('data-part="dialog"');
  });
});
