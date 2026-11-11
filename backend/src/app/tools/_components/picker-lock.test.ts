// src/app/tools/_components/picker-lock.test.ts

/**
 * The search tool's data source picker: a tool made on the built-in docs data source changes
 * the built-in help, which the server refuses to anyone but an Admin, so the picker locks that
 * option with the reason for everyone else.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { SearchProviderConfig } from './CreateWizard/configs/SearchProviderConfig';

import { BUILT_IN_REFUSAL } from '@/features/access/permissions';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

const SOURCES = [
  { id: 'docs', name: 'Interakt docs', isBuiltIn: true, status: 'healthy', documentCount: 40 },
  { id: 'shop', name: 'Shop catalog', isBuiltIn: false, status: 'healthy', documentCount: 900 },
];
// The list has loaded: loading starts true and the list empty, and an effect would fill them
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: <T,>(initial: T) => actual.useState(
      initial === (true as T) ? (false as T) : Array.isArray(initial) && initial.length === 0 ? (SOURCES as T) : initial,
    ),
  };
});
// The select's options render inline, as if open, keeping what each option is given
vi.mock('@/components/ui/select', async () => {
  const { createElement: h } = await import('react');
  const pass = ({ children }: { children?: unknown }) => h('div', null, children as never);
  const Item = ({ children, value, disabled }: { children?: unknown; value: string; disabled?: boolean }) =>
    h('div', { role: 'option', 'data-value': value, 'aria-disabled': disabled ? 'true' : undefined }, children as never);
  return { Select: pass, SelectContent: pass, SelectItem: Item, SelectTrigger: pass, SelectValue: () => null };
});

const option = (html: string, value: string) =>
  html.match(new RegExp(`<div role="option" data-value="${value}"[^>]*>(?:(?!<div role="option").)*`))?.[0] ?? '';
const picker = () => renderToStaticMarkup(createElement(SearchProviderConfig, { value: {}, onChange: () => {} } as never));

describe("the search tool's data source picker", () => {
  it('locks the built-in docs data source, with the reason, for a tool editor who is not an Admin', () => {
    uiAccess.hold('tools:view', 'tools:edit', 'data-sources:view');
    const html = picker();
    expect(option(html, 'docs')).toContain('aria-disabled="true"');
    expect(option(html, 'docs')).toContain('lucide-lock');
    expect(option(html, 'docs')).toContain(BUILT_IN_REFUSAL);
    expect(option(html, 'shop')).not.toContain('aria-disabled');
  });

  it('offers it to an Admin', () => {
    uiAccess.asAdmin();
    expect(option(picker(), 'docs')).not.toContain('aria-disabled');
  });
});
