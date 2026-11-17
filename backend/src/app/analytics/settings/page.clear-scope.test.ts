// src/app/analytics/settings/page.clear-scope.test.ts

/**
 * Clearing analytics data with Analytics off covers every experience, even when an experience was
 * picked earlier: the confirm handler calls clearAnalyticsData with no experience id. (Radix renders
 * no dialog on the server, so the dialog buttons are stubbed to hand their click handlers over.)
 */

import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAnalyticsData } from '../_lib/insights-api';

import AnalyticsSettingsPage from './page';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, isError: false, refetch: () => {} }),
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}));
const picked = vi.hoisted(() => ({ experienceId: 'exp-1' as string | undefined, experienceName: 'Help centre' as string | undefined }));
vi.mock('../_lib/AnalyticsContext', () => ({ useAnalyticsContext: () => picked }));
vi.mock('../_lib/insights-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/insights-api')>()),
  clearAnalyticsData: vi.fn(async () => {}),
}));
vi.mock('../_components/NeedsAttention', () => ({
  useProcessingStatus: () => ({ data: undefined, isError: false, refetch: () => {} }),
  useRefreshInsights: () => ({ refresh: () => {}, isProcessing: false }),
}));
vi.mock('../traces/_lib/hooks/useTraces', () => ({ useDeleteAllSpans: () => ({ isPending: false, mutate: () => {} }) }));

/** Confirm-button click handlers, by their text, captured while rendering */
const confirms = vi.hoisted(() => ({} as Record<string, () => unknown>));
vi.mock('@/shared/ui/components/alert-dialog', () => {
  const Inline = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
  return {
    AlertDialog: Inline,
    AlertDialogContent: Inline,
    AlertDialogHeader: Inline,
    AlertDialogFooter: Inline,
    AlertDialogTitle: Inline,
    AlertDialogDescription: Inline,
    AlertDialogCancel: Inline,
    AlertDialogAction: ({ children, onClick }: { children?: ReactNode; onClick?: () => unknown }) => {
      if (onClick) confirms[String(children)] = onClick;
      return createElement('button', null, children);
    },
  };
});

describe('clearing analytics data with Analytics off and an experience picked', () => {
  beforeEach(() => {
    uiAccess.asAdmin();
    vi.mocked(clearAnalyticsData).mockClear();
  });

  it('clears every experience: the confirm passes no experience id', async () => {
    uiAccess.areasOff('analytics');
    renderToStaticMarkup(createElement(AnalyticsSettingsPage));
    await confirms['Clear All Data']();
    expect(clearAnalyticsData).toHaveBeenCalledTimes(1);
    expect(clearAnalyticsData).toHaveBeenCalledWith(undefined);
  });

  it('clears only the picked experience with Analytics on (control)', async () => {
    renderToStaticMarkup(createElement(AnalyticsSettingsPage));
    await confirms['Clear Experience Data']();
    expect(clearAnalyticsData).toHaveBeenCalledWith('exp-1');
  });
});
