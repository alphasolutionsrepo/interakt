// src/app/experiences/_components/access.test.ts

/**
 * Experiences: the hub loads and shows only the kinds a user may view, and each experience's
 * actions follow its own kind (a role may edit search experiences and not chat ones).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listsToLoad, viewableTypes } from '../_hooks/useUnifiedExperiences';

import { chatSendGate } from '@/app/ai-experiences/_components/ChatTestPanel';
import CreateExperiencePage from '../(pages)/create/page';
import { ExperienceHeaderActions } from './ExperienceHeaderActions';

import type { Permission } from '@/features/access/permissions';
import { uiAccess } from '@/shared/test/ui-access-stub';
import { controlState } from '@/shared/test/rendered-controls';

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

describe('the experiences hub', () => {
  it('requests only the lists a user may view', () => {
    expect(listsToLoad(holding('search-experiences:view'), 'all')).toEqual({ skipAI: true, skipSearch: false });
    expect(listsToLoad(holding('ai-experiences:view', 'search-experiences:view'), 'all')).toEqual({ skipAI: false, skipSearch: false });
    expect(listsToLoad(holding(), 'all')).toEqual({ skipAI: true, skipSearch: true });
  });

  it("on a single-kind tab requests only that kind's list", () => {
    const both = holding('ai-experiences:view', 'search-experiences:view');
    expect(listsToLoad(both, 'ai')).toEqual({ skipAI: false, skipSearch: true });
    expect(listsToLoad(both, 'search')).toEqual({ skipAI: true, skipSearch: false });
    expect(listsToLoad(holding('search-experiences:view'), 'ai')).toEqual({ skipAI: true, skipSearch: true });
  });

  it('offers a tab per kind the user can view, and All only with both', () => {
    expect(viewableTypes(holding('ai-experiences:view', 'search-experiences:view'))).toEqual(['all', 'ai', 'search']);
    expect(viewableTypes(holding('search-experiences:view'))).toEqual(['search']);
    expect(viewableTypes(holding('ai-experiences:view'))).toEqual(['ai']);
  });
});

describe("an experience's header actions", () => {
  const header = (kind: 'ai' | 'search') => renderToStaticMarkup(createElement(ExperienceHeaderActions, {
    kind, experience: { isActive: true, isBuiltIn: false }, onEdit: () => {},
    controls: { regenerateToken: async () => {}, isRegeneratingToken: false, updateExperience: async () => {}, isUpdating: false },
  }));

  it('follow the kind: a search editor can change search experiences, not chat ones', () => {
    uiAccess.hold('search-experiences:view', 'search-experiences:edit', 'ai-experiences:view');
    for (const label of ['Regenerate Token', 'Deactivate', 'Edit']) {
      expect(controlState(header('search'), { text: label })).toBe('open');
      expect(controlState(header('ai'), { text: label })).toBe('locked');
    }
    expect(header('ai')).toContain('You don&#x27;t have permission to regenerate access tokens.');
  });
});

describe("the built-in Help Assistant's header", () => {
  it('is locked for a chat editor who is not an Admin', () => {
    uiAccess.hold('ai-experiences:view', 'ai-experiences:edit');
    const html = renderToStaticMarkup(createElement(ExperienceHeaderActions, {
      kind: 'ai', experience: { isActive: true, isBuiltIn: true }, onEdit: () => {},
      controls: { regenerateToken: async () => {}, isRegeneratingToken: false, updateExperience: async () => {}, isUpdating: false },
    }));
    for (const label of ['Regenerate Token', 'Deactivate', 'Edit']) expect(controlState(html, { text: label })).toBe('locked');
    expect(html).toContain('Only an Admin can change the built-in help.');
  });
});

describe('test chat', () => {
  const locked = { state: 'locked', reason: 'x' } as const;

  it('follows the server: playground:use, except on the built-in help, open to everyone signed in', () => {
    expect(chatSendGate(locked, false)).toEqual(locked);
    expect(chatSendGate(locked, true)).toEqual({ state: 'allowed' });
    expect(chatSendGate({ state: 'loading' }, true)).toEqual({ state: 'loading' });
  });
});

describe('choosing what to create', () => {
  beforeEach(() => { typeParam = null; });
  const page = () => renderToStaticMarkup(createElement(CreateExperiencePage));

  it('locks the kind the user cannot create, with the reason', () => {
    uiAccess.hold('search-experiences:edit', 'search-experiences:view');
    const html = page();
    expect(controlState(html, { textStartsWith: 'Search Experience' })).toBe('open');
    expect(controlState(html, { textStartsWith: 'AI Experience' })).toBe('locked');
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
