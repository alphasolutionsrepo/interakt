// app/settings/features/page.test.ts

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FeaturesPage from './page';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

const state = vi.hoisted(() => ({ features: {} as Record<string, unknown> }));
vi.mock('./_lib/hooks/useFeatureSwitches', () => ({
  useFeatures: () => state.features,
  useUpdateFeatures: () => ({ mutate: () => {}, isPending: false }),
}));

const rows = [
  { id: 'search', label: 'Search', description: 'Find things.', on: true, switchedOn: true, pinnedOff: false, needsAnyOf: [] },
  { id: 'chat', label: 'Chat', description: 'Chat experiences.', on: true, switchedOn: true, pinnedOff: false, needsAnyOf: [] },
];
const render = () => renderToStaticMarkup(createElement(FeaturesPage));

describe('Settings → Features page', () => {
  beforeEach(() => uiAccess.asAdmin());

  it('shows skeletons while loading, and no rows', () => {
    state.features = { isLoading: true, isError: false, data: undefined };
    const html = render();
    expect(html).toContain('animate-pulse');
    expect(html).not.toContain('Find things.');
    expect(html).not.toContain('Try Again');
  });

  it('shows the server message and a Try Again button on error', () => {
    state.features = { isLoading: false, isError: true, error: new Error('Database is down'), data: undefined, refetch: () => {} };
    const html = render();
    expect(html).toContain('Database is down');
    expect(html).toContain('Try Again');
  });

  it('shows every row once loaded, without the dialog', () => {
    state.features = { isLoading: false, isError: false, data: rows };
    const html = render();
    expect(html).toContain('Find things.');
    expect(html).toContain('Chat experiences.');
    expect(html).not.toContain('Try Again');
    expect(html).not.toContain('Also switch');
  });
});

describe('Settings → Features page access', () => {
  const ONLY_ADMIN = 'Only an Admin can turn features on or off.';
  const switches = (html: string) => html.match(/<button[^>]*role="switch"[^>]*>/g) ?? [];
  beforeEach(() => {
    state.features = { isLoading: false, isError: false, data: rows };
  });

  it('shows a non-Admin every switch disabled, with the reason', () => {
    uiAccess.hold();
    const html = render();
    const found = switches(html);
    expect(found).toHaveLength(rows.length);
    for (const s of found) expect(s).toMatch(/ disabled(=|\s|>)/);
    expect(html).toContain(ONLY_ADMIN);
  });

  it('lets an Admin use every switch, with no reason shown', () => {
    uiAccess.asAdmin();
    const html = render();
    const found = switches(html);
    expect(found).toHaveLength(rows.length);
    for (const s of found) expect(s).not.toMatch(/ disabled(=|\s|>)/);
    expect(html).not.toContain(ONLY_ADMIN);
  });
});
