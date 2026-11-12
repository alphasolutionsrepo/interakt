// src/app/setup/_components/access.test.ts

/**
 * Initial Setup and the help panel link only to pages the role can open: "AI provider" in the
 * setup intro becomes plain text without ai-providers:view, and the help panel's "Go to Initial
 * Setup" shows only to a role that can run the setup. Building the docs assistant changes the
 * built-in help, so its Build/Rebuild are locked for anyone but an Admin and it builds itself
 * only for an Admin.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import SetupDemoPage from '../page';

import { autoBuildDue, DocsBuildButton } from './DocsAssistantCard';

import { BUILT_IN_REFUSAL } from '@/features/access/permissions';
import { controlState, textOf } from '@/shared/test/rendered-controls';
import { uiAccess, uiAccessLoading } from '@/shared/test/ui-access-stub';
import { AssistantNotReady } from '@/shared/ui/custom/HelpChat';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

describe('Initial Setup', () => {
  const page = () => renderToStaticMarkup(createElement(SetupDemoPage));

  it('names the AI provider page as plain text for a role that can\'t open it', () => {
    uiAccess.hold('setup:run');
    const html = page();
    expect(html).not.toContain('href="/ai-providers"');
    expect(html).toContain('First connect an AI provider');
  });

  it('links it for a role that can', () => {
    uiAccess.hold('setup:run', 'ai-providers:view');
    expect(page()).toContain('href="/ai-providers"');
  });
});

describe('the help panel before the assistant is set up', () => {
  const note = () => renderToStaticMarkup(createElement(AssistantNotReady));

  it('offers no link to Initial Setup to a role that can\'t open it', () => {
    uiAccess.hold('search-experiences:view');
    expect(note()).not.toContain('Go to Initial Setup');
  });

  it('links Initial Setup for a role that can run it', () => {
    uiAccess.asAdmin();
    expect(note()).toContain('href="/setup"');
  });
});

describe('the Documentation Assistant build', () => {
  const SETUP_RUNNER = ['setup:run', 'ai-providers:view', 'ai-providers:manage', 'settings:view', 'settings:manage', 'search-indexes:view', 'search-indexes:edit', 'documents:edit', 'search-experiences:view', 'search-experiences:edit', 'ai-experiences:view', 'ai-experiences:edit', 'tools:view', 'tools:edit', 'data-sources:view', 'data-sources:edit', 'prompts:view', 'prompts:edit'] as const;
  const button = (rebuild: boolean) => renderToStaticMarkup(createElement(DocsBuildButton, { rebuild, onBuild: () => {} }));

  it.each([['Build the assistant', false], ['Rebuild', true]] as const)("locks %s for a setup runner who isn't an Admin, with the server's reason", (label, rebuild) => {
    uiAccess.hold(...SETUP_RUNNER);
    const html = button(rebuild);
    expect(controlState(html, { text: label })).toBe('locked');
    expect(textOf(html)).toContain(BUILT_IN_REFUSAL);
  });

  it.each([['Build the assistant', false], ['Rebuild', true]] as const)('leaves %s open for an Admin', (label, rebuild) => {
    uiAccess.asAdmin();
    expect(controlState(button(rebuild), { text: label })).toBe('open');
  });

  it('keeps it closed while access is loading', () => {
    uiAccessLoading();
    expect(controlState(button(false), { text: 'Build the assistant' })).not.toBe('open');
  });

  const due = (over: Partial<Parameters<typeof autoBuildDue>[0]> = {}) =>
    autoBuildDue({ loading: false, building: false, tried: false, allowed: true, status: { ready: true, seeded: false }, ...over });

  it('builds itself for an Admin once it can be built', () => {
    expect(due()).toBe(true);
  });

  it("never builds itself for anyone else, or before it can, or twice", () => {
    expect(due({ allowed: false })).toBe(false);
    expect(due({ status: { ready: false, seeded: false } })).toBe(false);
    expect(due({ status: { ready: true, seeded: true } })).toBe(false);
    expect(due({ tried: true })).toBe(false);
    expect(due({ loading: true })).toBe(false);
    expect(due({ building: true })).toBe(false);
    expect(due({ status: null })).toBe(false);
  });
});
