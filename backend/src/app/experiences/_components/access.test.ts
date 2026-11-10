// src/app/experiences/_components/access.test.ts

/**
 * Experiences: the hub loads and shows only the kinds a user may view, and each experience's
 * actions follow its own kind (a role may edit search experiences and not chat ones).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listsToLoad, viewableTypes } from '../_hooks/useUnifiedExperiences';
import CreateExperiencePage from '../(pages)/create/page';
import { ExperienceHeaderActions } from './ExperienceHeaderActions';

import type { Permission } from '@/features/access/permissions';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
let typeParam: string | null = null;
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => typeParam }),
  useRouter: () => ({ push: () => {} }),
}));
// The wizards themselves aren't under test here
vi.mock('@/app/ai-experiences/_components/CreateWizard/CreateWizard', () => ({ CreateWizard: () => 'AI WIZARD' }));
vi.mock('@/app/search-experiences/_components/CreateWizard/CreateWizard', () => ({ CreateWizard: () => 'SEARCH WIZARD' }));

const holding = (...held: Permission[]) => (p: Permission) => held.includes(p);
/** "locked", "disabled" or "open", for the button holding this text */
const buttonState = (html: string, text: string) => {
  const m = [...html.matchAll(/(<span[^>]*data-locked=""[^>]*>)?(<button[^>]*>)((?:(?!<\/button>).)*)<\/button>/g)]
    .find(([, , , inner]) => inner.replace(/<[^>]+>/g, '').includes(text));
  if (!m) return 'missing';
  return m[1] ? 'locked' : m[2].includes('disabled=""') ? 'disabled' : 'open';
};

describe('the experiences hub', () => {
  it('requests only the lists a user may view', () => {
    expect(listsToLoad(holding('search-experiences:view'))).toEqual({ skipAI: true, skipSearch: false });
    expect(listsToLoad(holding('ai-experiences:view', 'search-experiences:view'))).toEqual({ skipAI: false, skipSearch: false });
    expect(listsToLoad(holding())).toEqual({ skipAI: true, skipSearch: true });
  });

  it('offers a tab per kind the user can view, and All only with both', () => {
    expect(viewableTypes(holding('ai-experiences:view', 'search-experiences:view'))).toEqual(['all', 'ai', 'search']);
    expect(viewableTypes(holding('search-experiences:view'))).toEqual(['search']);
    expect(viewableTypes(holding('ai-experiences:view'))).toEqual(['ai']);
  });
});

describe("an experience's header actions", () => {
  const header = (kind: 'ai' | 'search') => renderToStaticMarkup(createElement(ExperienceHeaderActions, {
    kind, isActive: true, onEdit: () => {},
    controls: { regenerateToken: async () => {}, isRegeneratingToken: false, updateExperience: async () => {}, isUpdating: false },
  }));

  it('follow the kind: a search editor can change search experiences, not chat ones', () => {
    uiAccess.hold('search-experiences:view', 'search-experiences:edit', 'ai-experiences:view');
    for (const label of ['Regenerate Token', 'Deactivate', 'Edit']) {
      expect(buttonState(header('search'), label)).toBe('open');
      expect(buttonState(header('ai'), label)).toBe('locked');
    }
    expect(header('ai')).toContain('You don&#x27;t have permission to regenerate access tokens.');
  });
});

describe('choosing what to create', () => {
  beforeEach(() => { typeParam = null; });
  const page = () => renderToStaticMarkup(createElement(CreateExperiencePage));

  it('locks the kind the user cannot create, with the reason', () => {
    uiAccess.hold('search-experiences:edit', 'search-experiences:view');
    const html = page();
    expect(buttonState(html, 'Search Experience')).toBe('open');
    expect(buttonState(html, 'AI Experience')).toBe('locked');
    expect(html).toContain('You don&#x27;t have permission to create chat experiences.');
  });

  it("shows the choice instead of a wizard for a kind the user can't create", () => {
    uiAccess.hold('search-experiences:edit');
    typeParam = 'ai';
    expect(page()).not.toContain('AI WIZARD');
    typeParam = 'search';
    expect(page()).toContain('SEARCH WIZARD');
  });
});
