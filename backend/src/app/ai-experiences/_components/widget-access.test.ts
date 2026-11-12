// src/app/ai-experiences/_components/widget-access.test.ts

/**
 * The chat widget: its Save is locked with the reason without ai-experiences:edit (and on the
 * built-in help for anyone but an Admin), and the access token and widget card on a chat
 * experience's page are hidden without it.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AIExperienceDetail } from './AIExperienceDetail';
import { ChatWidgetCard } from './ChatWidgetCard';

import { controlState } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

const save = { text: 'Save' };
const card = (builtIn: boolean) => renderToStaticMarkup(createElement(ChatWidgetCard, {
  accessToken: 'tok', accessConfig: {}, onSave: async () => {}, isSaving: false, builtIn,
}));

describe('the chat widget card', () => {
  it('locks Save with the reason for a role without ai-experiences:edit', () => {
    uiAccess.hold('ai-experiences:view');
    const html = card(false);
    expect(controlState(html, save)).toBe('locked');
    expect(html).toContain('You don&#x27;t have permission to edit chat experiences.');
  });

  it('does not lock Save for a role with ai-experiences:edit (it is disabled until something changes)', () => {
    uiAccess.hold('ai-experiences:view', 'ai-experiences:edit');
    expect(controlState(card(false), save)).toBe('disabled');
  });

  it('locks Save on the built-in help for an editor who is not an Admin, not for an Admin', () => {
    uiAccess.hold('ai-experiences:view', 'ai-experiences:edit');
    expect(controlState(card(true), save)).toBe('locked');
    uiAccess.asAdmin();
    expect(controlState(card(true), save)).toBe('disabled');
  });
});

// The detail page around the card: only whether the token and widget card show is under test
let experience: Record<string, unknown> = {};
vi.mock('../_lib/hooks/useAIExperiences', () => ({ useAIExperience: () => ({ experience, isLoading: false, isError: false }) }));
vi.mock('./ChatTestPanel', () => ({ ChatTestPanel: () => null }));
vi.mock('./PipelineStepsCard', () => ({ PipelineStepsCard: () => null }));

describe('the chat experience page', () => {
  const page = () => {
    experience = {
      id: 'e', slug: 's', name: 'Help', description: null, isActive: true, isBuiltIn: false, tools: [], accessToken: 'tok-123',
      pipelineMode: 'standard', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      personaConfig: {}, sessionConfig: {}, accessConfig: {}, observabilityConfig: {},
    };
    return renderToStaticMarkup(createElement(AIExperienceDetail, { id: 'e' }));
  };

  it('hides the access token and the widget card without ai-experiences:edit', () => {
    uiAccess.hold('ai-experiences:view');
    const html = page();
    expect(html).not.toContain('Chat Widget');
    expect(html).not.toContain('tok-123');
  });

  it('shows them with ai-experiences:edit', () => {
    uiAccess.hold('ai-experiences:view', 'ai-experiences:edit');
    const html = page();
    expect(html).toContain('Chat Widget');
    expect(html).toContain('Access Token');
  });
});
