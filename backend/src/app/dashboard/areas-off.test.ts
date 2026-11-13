// src/app/dashboard/areas-off.test.ts

/**
 * Home with Analytics off: no "Ask about your analytics" box and no Ask drawer mounted, and an
 * experience's analytics button is gone, while the rest of the page stays.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AskBox } from './_components/AskBox';
import { ExperiencesList } from './_components/ExperiencesList';
import HomePage from './page';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@/app/analytics/_lib/AskPanelContext', () => ({
  useAskPanel: () => ({ canAsk: true, open: () => {} }),
  AskPanelProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/app/analytics/_lib/AnalyticsContext', () => ({ AnalyticsProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/app/analytics/_components/shell/AskPanel', () => ({ AskPanel: () => createElement('aside', null, 'ASK-DRAWER') }));
vi.mock('@/app/analytics/_components/shell/ChatHistoryButton', () => ({ ChatHistoryButton: () => null }));
vi.mock('./_lib/useHome', () => ({ useHome: () => ({ isLoading: false, isError: false, data: undefined, refetch: () => {} }) }));
vi.mock('./_components/MetricsStrip', () => ({ MetricsStrip: () => null }));
vi.mock('./_components/HomeCards', () => ({ HomeCards: () => null }));
vi.mock('./_components/RecentChanges', () => ({ RecentChanges: () => null }));
vi.mock('./_components/SetupChecklist', () => ({ SetupChecklist: () => null }));
vi.mock('./_components/TaskChips', () => ({ TaskChips: () => null }));

const exp = { id: 'e', name: 'Shop', type: 'search', active: true, volume: 3, issue: null, trend: [1], href: '/experiences/search/e', analyticsHref: '/analytics/search?x=1' };
const list = () => renderToStaticMarkup(createElement(ExperiencesList, { experiences: [exp] as never, loading: false }));

describe('the home page with Analytics', () => {
  it('shows the Ask box and mounts the Ask drawer while Analytics is on', () => {
    uiAccess.asAdmin();
    const html = renderToStaticMarkup(createElement(HomePage));
    expect(html).toContain('Ask about your analytics');
    expect(html).toContain('ASK-DRAWER');
  });

  it('shows neither with Analytics off, and keeps the experiences section', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('analytics');
    const html = renderToStaticMarkup(createElement(HomePage));
    expect(html).not.toContain('Ask about your analytics');
    expect(html).not.toContain('ASK-DRAWER');
    expect(html).toContain('Your experiences');
  });

  it('renders no Ask box on its own with Analytics off', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('analytics');
    expect(renderToStaticMarkup(createElement(AskBox))).toBe('');
  });

  it('links an experience to its analytics only while Analytics is on', () => {
    uiAccess.asAdmin();
    expect(list()).toContain('href="/analytics/search?x=1"');
    uiAccess.areasOff('analytics');
    expect(list()).not.toContain('/analytics/search');
    expect(list()).toContain('href="/experiences/search/e"');
  });
});
