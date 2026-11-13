// src/app/analytics/_components/shell/AnalyticsShell.test.ts

/** Opening a section of an off area by link or bookmark shows the off note, not the content. */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsShell } from './AnalyticsShell';

import { areaOffText } from '@/shared/access/AreaOffNote';
import { uiAccess, uiAccessLoading } from '@/shared/test/ui-access-stub';

const path = vi.hoisted(() => ({ current: '/analytics/conversations' }));

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ usePathname: () => path.current }));
vi.mock('@tanstack/react-query', () => ({
  useIsFetching: () => 0,
  useQueryClient: () => ({ getQueryCache: () => ({ getAll: () => [], subscribe: () => () => {} }), invalidateQueries: () => {} }),
}));
vi.mock('../../_lib/AnalyticsContext', () => ({ useAnalyticsContext: () => ({ experienceType: undefined }) }));
vi.mock('../../_lib/AskPanelContext', () => ({ useAskPanel: () => ({ canAsk: false, isOpen: false, toggle: () => {} }) }));
vi.mock('../ExperienceSelector', () => ({ ExperienceSelector: () => null }));
vi.mock('../PeriodPicker', () => ({ PeriodPicker: () => null }));
vi.mock('./AskPanel', () => ({ AskPanel: () => null }));

const render = () => renderToStaticMarkup(createElement(AnalyticsShell, null, createElement('div', null, 'SECTION CONTENT')));

describe('AnalyticsShell on a section whose area is off', () => {
  beforeEach(() => {
    path.current = '/analytics/conversations';
    uiAccess.asAdmin();
  });

  it('shows the content with the area on', () => {
    expect(render()).toContain('SECTION CONTENT');
  });

  it('shows the Chat off note instead of Conversations with Chat off', () => {
    uiAccess.areasOff('chat');
    const html = render();
    expect(html).toContain(areaOffText('chat'));
    expect(html).toContain('Chat is turned off for this installation.');
    expect(html).not.toContain('SECTION CONTENT');
  });

  it('shows the Search off note instead of Search with Search off', () => {
    path.current = '/analytics/search';
    uiAccess.areasOff('search');
    const html = render();
    expect(html).toContain(areaOffText('search'));
    expect(html).not.toContain('SECTION CONTENT');
  });

  it('names both areas on Traces when Search and Chat are both off, and one when only one is', () => {
    path.current = '/analytics/traces';
    uiAccess.areasOff('search', 'chat');
    const html = render();
    // One note of the section's own per off area (the workspace-wide note above it says something else)
    expect(html.split('Traces is hidden').length - 1).toBe(2);
    expect(html).toContain(areaOffText('search'));
    expect(html).toContain(areaOffText('chat'));
    expect(html).not.toContain('SECTION CONTENT');
    uiAccess.asAdmin();
    uiAccess.areasOff('search');
    expect(render()).toContain('SECTION CONTENT');
  });

  it('shows the content while access is still loading', () => {
    uiAccessLoading();
    const html = render();
    expect(html).toContain('SECTION CONTENT');
    expect(html).not.toContain('turned off for this installation.</span>');
  });
});
