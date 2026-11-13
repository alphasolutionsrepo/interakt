// src/app/analytics/_components/shell/AnalyticsShell.test.ts

/** The shell's own off states; a section of an off area is closed by PageAccessGate before the shell renders. */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsShell } from './AnalyticsShell';

import type { Area } from '@/features/feature-switches/areas';
import { pageAreasOn } from '@/features/feature-switches/page-areas';
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
vi.mock('../../_lib/AskPanelContext', () => ({ useAskPanel: () => ({ canAsk: true, isOpen: false, toggle: () => {} }) }));
vi.mock('../ExperienceSelector', () => ({ ExperienceSelector: () => createElement('i', null, 'EXPERIENCE SELECTOR') }));
vi.mock('../PeriodPicker', () => ({ PeriodPicker: () => createElement('i', null, 'PERIOD PICKER') }));
vi.mock('./AskPanel', () => ({ AskPanel: () => createElement('i', null, 'ASK PANEL') }));

const render = () => renderToStaticMarkup(createElement(AnalyticsShell, null, createElement('div', null, 'SECTION CONTENT')));

describe('AnalyticsShell on a section whose area is off', () => {
  beforeEach(() => {
    path.current = '/analytics/conversations';
    uiAccess.asAdmin();
  });

  it('shows the content with the area on', () => {
    expect(render()).toContain('SECTION CONTENT');
  });

  it('leaves closing a section of an off area to the page gate, which wraps the shell', () => {
    // The shell renders its content as is; PageAccessGate (AppShell) never lets these pages render
    const cases: Array<[string, Area[], boolean]> = [
      ['/analytics/conversations', ['chat'], false],
      ['/analytics/ai', ['chat'], false],
      ['/analytics/search', ['search'], false],
      ['/analytics/traces', ['search', 'chat'], false],
      ['/analytics/traces', ['search'], true],
    ];
    for (const [href, off, open] of cases) {
      expect(pageAreasOn(href, (a) => !off.includes(a))).toBe(open);
    }
    path.current = '/analytics/conversations';
    uiAccess.areasOff('chat');
    expect(render()).toContain('SECTION CONTENT');
  });

  it('shows the content while access is still loading', () => {
    uiAccessLoading();
    const html = render();
    expect(html).toContain('SECTION CONTENT');
    expect(html).not.toContain('turned off for this installation.</span>');
  });
});

describe('AnalyticsShell with Analytics off', () => {
  beforeEach(() => {
    path.current = '/analytics/settings';
    uiAccess.asAdmin();
    uiAccess.areasOff('analytics');
  });

  it('keeps the settings page, with the Analytics off note and what stays available', () => {
    const html = render();
    expect(html).toContain('SECTION CONTENT');
    expect(html).toContain(areaOffText('analytics'));
    expect(html).toContain('Collection and retention settings stay available.');
  });

  it('leaves out every part that calls analytics: selector, period, section row, Ask', () => {
    const html = render();
    for (const part of ['EXPERIENCE SELECTOR', 'PERIOD PICKER', 'ASK PANEL', 'Analytics sections', 'Refresh analytics'])
      expect(html).not.toContain(part);
  });

  it('shows the note alone, without the page, on any other section', () => {
    path.current = '/analytics/overview';
    const html = render();
    expect(html).toContain(areaOffText('analytics'));
    expect(html).not.toContain('SECTION CONTENT');
    expect(html).not.toContain('EXPERIENCE SELECTOR');
  });

  it('still shows the selector, section row and Ask with Analytics on', () => {
    uiAccess.asAdmin();
    const html = render();
    expect(html).toContain('EXPERIENCE SELECTOR');
    expect(html).toContain('ASK PANEL');
    expect(html).toContain('Analytics sections');
  });

  it('does not show the off note while access is loading', () => {
    uiAccessLoading();
    expect(render()).not.toContain(areaOffText('analytics'));
  });
});
