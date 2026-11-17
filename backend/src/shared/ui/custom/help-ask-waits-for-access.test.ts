// src/shared/ui/custom/help-ask-waits-for-access.test.ts

/**
 * With Ask remembered, a question is never sent while access is still loading: the server may have
 * the Help assistant off. The drawer stays in Ask mode, but its send button is disabled until access
 * shows the assistant on, and shows a spinner meanwhile. Enter, the send button and "Ask AI about … instead" all go through canAsk.
 * useState is wrapped so the remembered mode starts on 'ask' and the box already holds a question
 * (a server render runs no effects or typing).
 */

import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { canAsk, HelpButton } from './HelpButton';

import { uiAccess, uiAccessLoading } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: () => {} }) }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const start = (initial: unknown) => (initial === 'search' ? 'ask' : initial === '' ? 'How do I create an index?' : initial);
  return { ...actual, useState: (initial: unknown) => actual.useState(start(initial)) };
});
// The drawer renders its content inline, as if open
vi.mock('@/components/ui/sheet', () => {
  const Inline = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
  return { Sheet: Inline, SheetContent: Inline, SheetHeader: Inline, SheetTitle: Inline, SheetDescription: Inline, SheetTrigger: () => null };
});

/** The Ask send button's markup */
const sendButton = () => {
  const html = renderToStaticMarkup(createElement(HelpButton));
  const button = html.match(/<button[^>]*aria-label="Ask"[^>]*>[\s\S]*?<\/button>/)?.[0];
  expect(button, 'the Ask send button is rendered').toBeDefined();
  return button!;
};

describe('sending a Help question while access loads, with Ask remembered', () => {
  it('disables the send button until access is known, and shows it waiting', () => {
    uiAccessLoading();
    expect(sendButton()).toMatch(/\sdisabled=""/);
    expect(sendButton()).toContain('animate-spin');
  });

  it('enables it once access shows the Help assistant on (control)', () => {
    uiAccess.asAdmin();
    expect(sendButton()).not.toMatch(/\sdisabled=""/);
    expect(sendButton()).not.toContain('animate-spin');
  });
});

describe('canAsk', () => {
  it('refuses while access is unknown, even with a question typed', () => {
    expect(canAsk('How do I create an index?', null, false)).toBe(false);
  });

  it('refuses with the Help assistant off', () => {
    expect(canAsk('How do I create an index?', false, false)).toBe(false);
  });

  it('refuses an empty question or one sent while an answer is in flight', () => {
    expect(canAsk('   ', true, false)).toBe(false);
    expect(canAsk('How do I create an index?', true, true)).toBe(false);
  });

  it('allows a question once the Help assistant is known to be on', () => {
    expect(canAsk('How do I create an index?', true, false)).toBe(true);
  });
});
