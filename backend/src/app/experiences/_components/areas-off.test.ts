// src/app/experiences/_components/areas-off.test.ts

/**
 * Experiences with a feature area turned off: the hub loads and shows only the kinds whose area
 * is on, with one note for the other; the create page offers only those kinds.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import CreateExperiencePage from '../(pages)/create/page';
import ExperiencesPage from '../(pages)/page';
import { listsToLoad, viewableTypes } from '../_hooks/useUnifiedExperiences';

import type { Area } from '@/features/feature-switches/areas';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ push: () => {} }),
}));
vi.mock('@/app/ai-experiences/_components/CreateWizard/CreateWizard', () => ({ CreateWizard: () => 'AI WIZARD' }));
vi.mock('@/app/search-experiences/_components/CreateWizard/CreateWizard', () => ({ CreateWizard: () => 'SEARCH WIZARD' }));
// The hub's data isn't under test; the lists it would load are (listsToLoad, below)
vi.mock('../_hooks/useUnifiedExperiences', async (orig) => ({
  ...(await orig<typeof import('../_hooks/useUnifiedExperiences')>()),
  useUnifiedExperiences: () => ({
    items: [], pagination: { page: 1, pageSize: 12, totalItems: 0, totalPages: 0 },
    metrics: { total: 0, active: 0, aiCount: 0, searchCount: 0 },
    isLoading: false, isRefetching: false, refetch: () => {},
    deleteAIExperience: async () => {}, deleteSearchExperience: async () => {}, isDeletingAI: false, isDeletingSearch: false,
  }),
}));

const everyone = () => true;
const on = (...off: Area[]) => (a: Area) => !off.includes(a);

describe('the hub with a feature area off', () => {
  it('does not load the list of a kind whose area is off (its API would answer "turned off")', () => {
    expect(listsToLoad(everyone, on('chat'))).toEqual({ skipAI: true, skipSearch: false });
    expect(listsToLoad(everyone, on('search'))).toEqual({ skipAI: false, skipSearch: true });
    expect(listsToLoad(everyone, on())).toEqual({ skipAI: false, skipSearch: false });
    expect(listsToLoad(everyone, on('chat', 'search'))).toEqual({ skipAI: true, skipSearch: true });
  });

  it('offers tabs only for kinds whose area is on, and All only with both', () => {
    expect(viewableTypes(everyone, on('chat'))).toEqual(['search']);
    expect(viewableTypes(everyone, on('search'))).toEqual(['ai']);
    expect(viewableTypes(everyone, on())).toEqual(['all', 'ai', 'search']);
  });

  it('shows one note under the header and only the other kind’s card', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('chat');
    const html = renderToStaticMarkup(createElement(ExperiencesPage));
    expect(html).toContain('Chat is turned off for this installation.');
    expect(html).toContain('Search Experiences');
    expect(html).not.toContain('AI Experiences');
  });

  it('shows no note and both cards with everything on', () => {
    uiAccess.asAdmin();
    const html = renderToStaticMarkup(createElement(ExperiencesPage));
    expect(html).not.toContain('turned off');
    expect(html).toContain('AI Experiences');
    expect(html).toContain('Search Experiences');
  });
});

describe('the create page with a feature area off', () => {
  it('offers the kind whose area is on and replaces the other with the note', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('search');
    const html = renderToStaticMarkup(createElement(CreateExperiencePage));
    expect(html).toContain('AI Experience');
    expect(html).not.toContain('Search Experience');
    expect(html).toContain('Search is turned off for this installation.');
  });

  it('offers both with everything on', () => {
    uiAccess.asAdmin();
    const html = renderToStaticMarkup(createElement(CreateExperiencePage));
    expect(html).toContain('AI Experience');
    expect(html).toContain('Search Experience');
    expect(html).not.toContain('turned off');
  });
});
