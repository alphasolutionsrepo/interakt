// app/settings/features/_components/FeatureRowItem.test.ts

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { FeatureRowItem } from './FeatureRowItem';

import { PINNED_OFF_MESSAGE } from '@/features/feature-switches/areas';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

const base = { id: 'chat' as const, label: 'Chat', description: 'Chat experiences.', on: true, switchedOn: true, pinnedOff: false, needsAnyOf: [] };
const render = (over = {}) =>
  renderToStaticMarkup(createElement(FeatureRowItem, { area: { ...base, ...over }, areas: [{ ...base, ...over }], onToggle: () => {} }));

describe('FeatureRowItem', () => {
  it('lets an Admin switch it', () => {
    uiAccess.asAdmin();
    const html = render();
    expect(html).toContain('Chat experiences.');
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('data-locked');
  });

  it('shows a non-Admin the value, locked with the reason', () => {
    uiAccess.hold('settings:manage');
    const html = render();
    expect(html).toContain('disabled=""');
    expect(html).toContain('Only an Admin can turn features on or off.');
    expect(html).toContain('aria-checked="true"');
  });

  it('locks a pinned-off area with the deployment reason, even for an Admin', () => {
    uiAccess.asAdmin();
    const html = render({ on: false, pinnedOff: true });
    expect(html).toContain('disabled=""');
    expect(html).toContain(PINNED_OFF_MESSAGE);
    expect(html).toContain('aria-checked="false"');
  });

  it('lets an Admin switch off an area that is on but whose need is off, and says what it needs', () => {
    uiAccess.asAdmin();
    const search = { ...base, id: 'search' as const, label: 'Search', on: false, switchedOn: false };
    const ai = { ...base, id: 'ai-summaries' as const, label: 'AI summaries', on: false, switchedOn: true, needsAnyOf: ['search' as const] };
    const html = renderToStaticMarkup(createElement(FeatureRowItem, { area: ai, areas: [search, ai], onToggle: () => {} }));
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('Needs Search');
  });

  it('still locks that row for a non-Admin', () => {
    uiAccess.hold('settings:manage');
    const search = { ...base, id: 'search' as const, label: 'Search', on: false, switchedOn: false };
    const ai = { ...base, id: 'ai-summaries' as const, label: 'AI summaries', on: false, switchedOn: true, needsAnyOf: ['search' as const] };
    const html = renderToStaticMarkup(createElement(FeatureRowItem, { area: ai, areas: [search, ai], onToggle: () => {} }));
    expect(html).toContain('disabled=""');
    expect(html).toContain('Only an Admin can turn features on or off.');
    expect(html).toContain('Needs Search');
  });
});
