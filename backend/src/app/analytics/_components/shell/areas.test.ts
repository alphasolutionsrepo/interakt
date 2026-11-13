// src/app/analytics/_components/shell/areas.test.ts

/**
 * Analytics with feature areas off: sections of an off area leave the nav, one note per off
 * area says why, and Ask needs Analytics on.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { canAskAnalytics } from '../../_lib/AskPanelContext';

import { HiddenSectionsNote } from './HiddenSectionsNote';
import { SectionNav } from './SectionNav';

import { textOf } from '@/shared/test/rendered-controls';
import { uiAccess, uiAccessLoading } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ usePathname: () => '/analytics/overview' }));
vi.mock('../../_lib/AnalyticsContext', () => ({ useAnalyticsContext: () => ({ experienceType: undefined }) }));
vi.mock('../../_lib/hooks/useAnalyticsChat', () => ({ useAnalyticsChat: () => ({}) }));

const nav = () => renderToStaticMarkup(createElement(SectionNav));
const links = (html: string) => [...html.matchAll(/<a [^>]*>(.*?)<\/a>/g)].map((m) => textOf(m[1]));

describe('the analytics section nav', () => {
  it('shows every section with every area on', () => {
    uiAccess.asAdmin();
    expect(links(nav())).toEqual(['Overview', 'Search', 'Conversations', 'AI &amp; cost', 'Traces', 'Settings']);
  });

  it('leaves out Conversations and AI & cost with chat off', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('chat');
    expect(links(nav())).toEqual(['Overview', 'Search', 'Traces', 'Settings']);
  });

  it('leaves out Search with search off', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('search');
    expect(links(nav())).toEqual(['Overview', 'Conversations', 'AI &amp; cost', 'Traces', 'Settings']);
  });
});

describe('the hidden sections note', () => {
  it('says nothing with every area on, or while access loads', () => {
    uiAccess.asAdmin();
    expect(renderToStaticMarkup(createElement(HiddenSectionsNote))).toBe('');
    uiAccessLoading();
    expect(renderToStaticMarkup(createElement(HiddenSectionsNote))).toBe('');
  });

  it('names each off area, with Settings → Features for an Admin only', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('chat');
    const html = renderToStaticMarkup(createElement(HiddenSectionsNote));
    expect(textOf(html)).toContain('Chat is turned off for this installation. Its analytics sections are hidden; the data is kept.');
    expect(html).toContain('/settings/features');
    uiAccess.hold('analytics:view');
    uiAccess.areasOff('chat');
    expect(renderToStaticMarkup(createElement(HiddenSectionsNote))).not.toContain('/settings/features');
  });
});

describe('canAskAnalytics', () => {
  it('needs the permission and Analytics on', () => {
    expect(canAskAnalytics(() => true, () => true)).toBe(true);
    expect(canAskAnalytics(() => true, (a) => a !== 'analytics')).toBe(false);
    expect(canAskAnalytics(() => false, () => true)).toBe(false);
  });
});
