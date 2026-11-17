// src/app/analytics/settings/page.test.ts

/**
 * Analytics settings with Analytics off: the page stays usable for collection and the schedule,
 * Refresh now stays in view, locked with the reason, and clearing data stays usable (erasure
 * works whatever the switch says). What is fetched is checked in ../_components/access.test.ts.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AnalyticsSettingsPage from './page';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, isError: false, refetch: () => {} }),
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}));
const picked = vi.hoisted(() => ({ experienceId: undefined as string | undefined, experienceName: undefined as string | undefined }));
vi.mock('../_lib/AnalyticsContext', () => ({ useAnalyticsContext: () => picked }));
vi.mock('../_components/NeedsAttention', () => ({
  useProcessingStatus: () => ({ data: undefined, isError: false, refetch: () => {} }),
  useRefreshInsights: () => ({ refresh: () => {}, isProcessing: false }),
}));
vi.mock('../traces/_lib/hooks/useTraces', () => ({ useDeleteAllSpans: () => ({ isPending: false, mutate: () => {} }) }));

const render = () => renderToStaticMarkup(createElement(AnalyticsSettingsPage));
/** The <button> whose text contains `label`, and whether it sits in a lock hint with `reason` */
const buttonState = (html: string, label: string, reason: string) => {
  const at = html.indexOf(label);
  expect(at, `${label} is on the page`).toBeGreaterThan(-1);
  const start = html.lastIndexOf('<button', at);
  const button = html.slice(start, html.indexOf('</button>', at));
  const lockStart = html.lastIndexOf('data-locked', at);
  const locked = lockStart > -1 && html.slice(lockStart, at).includes('<button') && html.slice(at).includes(reason);
  return { disabled: /\sdisabled=""/.test(button), locked };
};

const OFF = 'Analytics is turned off for this installation.';

describe('Analytics settings with Analytics off', () => {
  beforeEach(() => {
    uiAccess.asAdmin();
  });

  it('keeps clearing data usable: retention and erasure work while Analytics is off', () => {
    uiAccess.areasOff('analytics');
    const html = render();
    expect(html).toContain('Analytics data');
    for (const label of ['Clear all analytics data', 'Clear only traces, for every experience']) {
      expect(buttonState(html, label, OFF).disabled).toBe(false);
    }
  });

  it('locks clearing data by permission for a role without analytics:manage', () => {
    uiAccess.hold('analytics:view', 'settings:view');
    const html = render();
    expect(buttonState(html, 'Clear all analytics data', 'clear analytics data').disabled).toBe(true);
    expect(html).toContain('clear analytics data');
  });

  it('scopes clearing to every experience, and says so, when a stale experience is still selected', () => {
    Object.assign(picked, { experienceId: 'exp-1', experienceName: 'Help centre' });
    try {
      uiAccess.areasOff('analytics');
      const off = render();
      expect(off).toContain('Clear all analytics data');
      expect(off).not.toContain('Help centre');
      uiAccess.asAdmin();
      expect(render()).toContain('Clear data for Help centre');
    } finally {
      Object.assign(picked, { experienceId: undefined, experienceName: undefined });
    }
  });

  it('keeps Refresh now, locked with the reason', () => {
    uiAccess.areasOff('analytics');
    expect(buttonState(render(), 'Refresh now', OFF)).toEqual({ disabled: true, locked: true });
  });

  it('leaves every button usable with Analytics on', () => {
    const html = render();
    expect(html).not.toContain(OFF);
    for (const label of ['Clear all analytics data', 'Clear only traces, for every experience', 'Refresh now']) {
      expect(buttonState(html, label, OFF).disabled).toBe(false);
    }
  });

  it('still locks Refresh now by permission for a role without analytics:manage', () => {
    uiAccess.hold('analytics:view', 'settings:view');
    const html = render();
    expect(html).toContain('refresh analytics findings');
    expect(buttonState(html, 'Refresh now', 'refresh analytics findings').disabled).toBe(true);
  });
});
