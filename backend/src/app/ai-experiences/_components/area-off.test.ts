// src/app/ai-experiences/_components/area-off.test.ts

/** The chat test panel with Playground off: Send stays visible, locked with the reason. */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ChatTestPanel } from './ChatTestPanel';

import { controlState } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
// The panel opens on a click; with no DOM here, start every false state true
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: <T,>(initial: T) => actual.useState(initial === (false as T) ? (true as T) : initial) };
});

const send = { attr: 'aria-label="Send"' };
const panel = (isBuiltIn: boolean) =>
  renderToStaticMarkup(createElement(ChatTestPanel, { experienceSlug: 's', experienceName: 'Chat', isBuiltIn }));

describe('the test chat panel with Playground off', () => {
  it('locks Send with the reason, even for an Admin', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('playground');
    const html = panel(false);
    expect(controlState(html, send)).toBe('locked');
    expect(html).toContain('Playground is turned off for this installation.');
  });

  it('leaves the built-in help chat alone: the help assistant is its own area', () => {
    uiAccess.hold('ai-experiences:view');
    uiAccess.areasOff('playground');
    expect(controlState(panel(true), send)).toBe('disabled');
  });
});

describe('the built-in help chat with the Help assistant off', () => {
  it('locks Send with the reason: the server refuses the help experience then', () => {
    uiAccess.hold('ai-experiences:view');
    uiAccess.areasOff('help-assistant');
    const html = panel(true);
    expect(controlState(html, send)).toBe('locked');
    expect(html).toContain('Help assistant is turned off for this installation.');
  });
});
