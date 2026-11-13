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
});
