// src/app/setup/_components/access.test.ts

/**
 * Initial Setup and the help panel link only to pages the role can open: "AI provider" in the
 * setup intro becomes plain text without ai-providers:view, and the help panel's "Go to Initial
 * Setup" shows only to a role that can run the setup.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import SetupDemoPage from '../page';

import { uiAccess } from '@/shared/test/ui-access-stub';
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
