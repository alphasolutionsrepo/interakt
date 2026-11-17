// src/shared/ui/custom/help-loading-ask-mode.test.ts

/**
 * While access is still loading, the open help drawer keeps the remembered mode: with Ask
 * remembered it stays in Ask, and its description says so (not "Search the docs.").
 * The remembered mode is read in an effect, which a server render doesn't run, so useState is
 * wrapped to start the remembered mode ('search' is the only state that starts with that value) on 'ask'.
 */

import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { HelpButton } from './HelpButton';

import { uiAccess, uiAccessLoading } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: () => {} }) }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: (initial: unknown) => actual.useState(initial === 'search' ? 'ask' : initial) };
});
// The drawer renders its content inline, as if open
vi.mock('@/components/ui/sheet', () => {
  const Inline = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
  return { Sheet: Inline, SheetContent: Inline, SheetHeader: Inline, SheetTitle: Inline, SheetDescription: Inline, SheetTrigger: () => null };
});

const drawer = () => renderToStaticMarkup(createElement(HelpButton));

describe('the open help drawer while access loads, with Ask remembered', () => {
  it('stays in Ask mode and describes asking', () => {
    uiAccessLoading();
    const html = drawer();
    expect(html).toContain('aria-label="Ask the Help Assistant"');
    expect(html).toContain('Search the docs, or ask the Help Assistant.');
    expect(html).not.toContain('>Search the docs.<');
  });

  it('drops to search once loaded with the Help assistant off (control)', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('help-assistant');
    const html = drawer();
    expect(html).toContain('aria-label="Search the docs"');
    expect(html).toContain('>Search the docs.<');
  });
});
