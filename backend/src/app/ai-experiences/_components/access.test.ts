// src/app/ai-experiences/_components/access.test.ts

/**
 * Test chat on a chat experience's page: a chat runs the experience for real, so Send is locked
 * with the reason without playground:use, except on the built-in help, which every signed-in
 * user may chat with. The detail page tells the panel which experience is the built-in help.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AIExperienceDetail } from './AIExperienceDetail';
import { ChatTestPanel } from './ChatTestPanel';

import { controlState } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
// The panel opens on a click; with no DOM here, it starts open by starting every false state true
// (Send then also shows as busy, so an allowed Send reads 'disabled' and a locked one 'locked')
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: <T,>(initial: T) => actual.useState(initial === (false as T) ? (true as T) : initial) };
});

const send = { attr: 'aria-label="Send"' };
const panel = (isBuiltIn: boolean) =>
  renderToStaticMarkup(createElement(ChatTestPanel, { experienceSlug: 's', experienceName: 'Chat', isBuiltIn }));

describe('the test chat panel', () => {
  it('locks Send with the reason for a role without playground:use', () => {
    uiAccess.hold('ai-experiences:view', 'ai-experiences:edit');
    const html = panel(false);
    expect(controlState(html, send)).toBe('locked');
    expect(html).toContain('You don&#x27;t have permission to test chat experiences.');
  });

  it('does not lock Send on the built-in help, nor for a playground user', () => {
    uiAccess.hold('ai-experiences:view');
    expect(controlState(panel(true), send)).toBe('disabled'); // busy and empty: its own reason, no lock
    uiAccess.hold('ai-experiences:view', 'playground:use');
    expect(controlState(panel(false), send)).toBe('disabled');
  });
});

// The detail page around the panel: only what it passes to the panel is under test
let experience: Record<string, unknown> = {};
vi.mock('../_lib/hooks/useAIExperiences', () => ({ useAIExperience: () => ({ experience, isLoading: false, isError: false }) }));
vi.mock('./ChatWidgetCard', () => ({ ChatWidgetCard: () => null }));
vi.mock('./PipelineStepsCard', () => ({ PipelineStepsCard: () => null }));

describe('the chat experience page', () => {
  const page = (isBuiltIn: boolean) => {
    experience = {
      id: 'e', slug: 's', name: 'Help', description: null, isActive: true, isBuiltIn, tools: [],
      pipelineMode: 'standard', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      personaConfig: {}, sessionConfig: {}, accessConfig: {}, observabilityConfig: {},
    };
    return renderToStaticMarkup(createElement(AIExperienceDetail, { id: 'e' }));
  };

  it('tells the panel which experience is the built-in help', () => {
    uiAccess.hold('ai-experiences:view');
    expect(controlState(page(true), send)).toBe('disabled');
    expect(controlState(page(false), send)).toBe('locked');
  });
});
