// src/app/analytics/_components/access.test.ts

/**
 * Analytics: refreshing findings, hiding and showing them, and scheduling the nightly refresh
 * change things for everyone, so they show locked with the reason for a role that can only view
 * analytics. Background Jobs is linked only for a role that can open it.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import AnalyticsSettingsPage from '../settings/page';

import { NeedsAttention } from './NeedsAttention';

import { controlState } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

// Each query answers from this table by its key; no requests are made. A query that isn't
// enabled gets nothing, as with react-query, and is recorded so tests can see it wasn't asked
const answers = new Map<string, unknown>();
const notAsked: string[] = [];
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey, enabled = true }: { queryKey: unknown[]; enabled?: boolean }) => {
    const key = JSON.stringify(queryKey.filter((k) => k !== undefined));
    if (!enabled) notAsked.push(key);
    return { data: enabled ? answers.get(key) : undefined, isLoading: false, isError: false, error: null, refetch: async () => {} };
  },
  useQueryClient: () => ({ invalidateQueries: () => {} }),
  useMutation: () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false, isError: false }),
}));
vi.mock('../_lib/AnalyticsContext', () => ({
  useAnalyticsContext: () => ({ experienceId: undefined, experienceName: 'All', timeRange: '7d' }),
}));
vi.mock('../_lib/AskPanelContext', () => ({ useAskPanel: () => ({ canAsk: false, open: () => {} }) }));

// The hidden list opens on a click; with no DOM here, open it by starting every false state true
// (which also shows Refresh as running, so that render is used for Show again only)
let startOpen = false;
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: <T,>(initial: T) => actual.useState(startOpen && initial === (false as T) ? (true as T) : initial),
  };
});

const finding = { id: 'f1', severity: 'warning', category: 'search_quality', title: 'Few results', description: 'd' };
answers.set(JSON.stringify(['analytics', 'insights', '7d']), {
  status: 'ready', timeRange: '7d', processedAt: new Date().toISOString(),
  insights: [finding], hidden: [{ ...finding, id: 'f2', title: 'Slow answers', hiddenUntil: new Date().toISOString() }],
});
answers.set(JSON.stringify(['analytics', 'processing-status']), { lastRun: null, currentRun: null, isStale: false });
answers.set(JSON.stringify(['analytics', 'settings', 'schedule']), null); // not scheduled: offers to schedule
answers.set(JSON.stringify(['analytics', 'settings', 'config']), {});

const needsAttention = (open = false) => {
  startOpen = open;
  try { return renderToStaticMarkup(createElement(NeedsAttention)); } finally { startOpen = false; }
};
const settings = () => renderToStaticMarkup(createElement(AnalyticsSettingsPage));

describe('what needs attention', () => {
  it('locks Refresh, Hide and Show again for a role that can only view analytics', () => {
    uiAccess.hold('analytics:view');
    const html = needsAttention();
    expect(controlState(html, { text: 'Refresh now' })).toBe('locked');
    expect(controlState(html, { text: 'Hide for 7 days' })).toBe('locked');
    expect(controlState(needsAttention(true), { text: 'Show again' })).toBe('locked');
    expect(html).toContain('You don&#x27;t have permission to refresh analytics findings.');
    expect(html).toContain('You don&#x27;t have permission to hide or show findings.');
  });

  it('opens them for a role that manages analytics', () => {
    uiAccess.hold('analytics:view', 'analytics:manage');
    for (const text of ['Refresh now', 'Hide for 7 days']) expect(controlState(needsAttention(), { text })).toBe('open');
    expect(controlState(needsAttention(true), { text: 'Show again' })).toBe('open');
  });
});

describe('analytics settings', () => {
  it('locks Refresh, and neither asks for nor links the job schedules, for a viewer', () => {
    uiAccess.hold('analytics:view');
    notAsked.length = 0;
    const html = settings();
    expect(controlState(html, { text: 'Refresh now' })).toBe('locked');
    expect(notAsked).toContain(JSON.stringify(['analytics', 'settings', 'schedule']));
    expect(html).toContain('You don&#x27;t have permission to see the background job schedules.');
    expect(html).not.toContain('Only admins');
    expect(html).not.toContain('href="/jobs"');
  });

  it('locks Schedule with the reason for a role that sees the schedules but cannot run jobs', () => {
    uiAccess.hold('analytics:view', 'settings:view');
    const html = settings();
    expect(controlState(html, { text: 'Schedule nightly refresh (02:00 UTC)' })).toBe('locked');
    expect(html).toContain('You don&#x27;t have permission to schedule background jobs.');
  });

  it('opens Refresh and Schedule and links Background Jobs for a role holding each permission', () => {
    uiAccess.hold('analytics:view', 'analytics:manage', 'jobs:run', 'settings:view');
    const html = settings();
    expect(controlState(html, { text: 'Refresh now' })).toBe('open');
    expect(controlState(html, { text: 'Schedule nightly refresh (02:00 UTC)' })).toBe('open');
    expect(html).toContain('href="/jobs"');
  });
});

describe('analytics settings with Analytics off', () => {
  const asked = (key: unknown[]) => !notAsked.includes(JSON.stringify(key));

  it('asks nothing the server refuses and hides what needs it', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('analytics');
    notAsked.length = 0;
    const html = settings();
    expect(notAsked).toContain(JSON.stringify(['analytics', 'processing-status']));
    // The tracking settings (core) and the job schedule (core) are still asked
    expect(asked(['analytics', 'settings', 'config'])).toBe(true);
    expect(asked(['analytics', 'settings', 'schedule'])).toBe(true);
    expect(html).toContain('What analytics records');
    expect(html).not.toContain('Refresh now');
    expect(html).not.toContain('Clear all analytics data');
  });

  it('asks for the status with Analytics on', () => {
    uiAccess.asAdmin();
    notAsked.length = 0;
    const html = settings();
    expect(notAsked).not.toContain(JSON.stringify(['analytics', 'processing-status']));
    expect(html).toContain('Refresh now');
    expect(html).toContain('Clear all analytics data');
  });
});
