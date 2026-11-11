// src/app/search-experiences/_components/access.test.ts

/**
 * A search experience's page: Regenerate Token, Activate / Deactivate, Edit and Delete locked with
 * the reason for a user who can only view search experiences, and on the built-in help for
 * anyone but an Admin; open to an editor otherwise.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchExperienceDetail } from './SearchExperienceDetail';

import { controlState } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
// Cards render their content as if expanded, so the Danger Zone's Delete is in the markup
vi.mock('@/shared/ui/custom/CollapsibleCard', async () => {
  const { createElement: h } = await import('react');
  return { CollapsibleCard: ({ children }: { children?: unknown }) => h('div', null, children as never) };
});

let isBuiltIn = false;
vi.mock('../_lib/hooks', () => ({
  useSearchExperience: () => ({
    experience: {
      id: 'x', name: 'Docs search', slug: 'docs', description: null, isActive: true, isBuiltIn,
      indexes: [], externalSources: [], allowedOrigins: [], accessToken: 'tok',
      searchConfig: {}, aiConfig: { enabled: false, summary: { enabled: false } }, toolsConfig: {},
      createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
    },
    isLoading: false, isError: false,
    deleteExperience: async () => {}, isDeleting: false,
    updateExperience: async () => {}, isUpdating: false,
    regenerateToken: async () => {}, isRegeneratingToken: false,
  }),
}));

const CONTROLS = ['Regenerate Token', 'Deactivate', 'Edit', 'Delete'] as const;
const states = () => {
  const html = renderToStaticMarkup(createElement(SearchExperienceDetail, { id: 'x' }));
  return { html, states: Object.fromEntries(CONTROLS.map((text) => [text, controlState(html, { text })])) };
};
const all = (state: string) => Object.fromEntries(CONTROLS.map((text) => [text, state]));

describe("a search experience's page", () => {
  beforeEach(() => { isBuiltIn = false; });

  it('locks every change for a viewer, with the reason', () => {
    uiAccess.hold('search-experiences:view');
    const { html, states: s } = states();
    expect(s).toEqual(all('locked'));
    expect(html).toContain('You don&#x27;t have permission to');
  });

  it('opens them to a search experience editor', () => {
    uiAccess.hold('search-experiences:view', 'search-experiences:edit');
    expect(states().states).toEqual(all('open'));
  });

  it('locks them on the built-in help for an editor who is not an Admin', () => {
    isBuiltIn = true;
    uiAccess.hold('search-experiences:view', 'search-experiences:edit');
    const { html, states: s } = states();
    expect(s).toEqual(all('locked'));
    expect(html).toContain('Only an Admin can change the built-in help.');
  });

  it('opens them on the built-in help to an Admin', () => {
    isBuiltIn = true;
    uiAccess.asAdmin();
    expect(states().states).toEqual(all('open'));
  });
});
