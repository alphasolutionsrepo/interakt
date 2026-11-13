// src/app/setup/areas-off.test.ts

/**
 * Initial Setup with feature areas off: the demo data card needs Search, Chat and Managed
 * indexes (a note in its place otherwise), the Documentation Assistant card needs the Help
 * assistant, and the "what's next" links show only for pages that are open.
 */

import { Search } from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { NextStep } from './_components/NextStep';
import SetupDemoPage from './page';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

const page = () => renderToStaticMarkup(createElement(SetupDemoPage));
const FEATURES = 'href="/settings/features"';

describe('Initial Setup with every area on', () => {
  it('shows the demo data and the Documentation Assistant, with no area note', () => {
    uiAccess.asAdmin();
    const html = page();
    expect(html).toContain('Fashion Catalog');
    expect(html).toContain('Documentation Assistant');
    expect(html).not.toContain('turned off');
    expect(html).not.toContain('Demo data needs');
  });
});

describe('the demo data card', () => {
  it.each([['search', 'Search'], ['chat', 'Chat'], ['managed-indexes', 'Managed indexes']] as const)('is replaced by a note when %s is off', (area, label) => {
    uiAccess.asAdmin();
    uiAccess.areasOff(area);
    const html = page();
    expect(html).not.toContain('Fashion Catalog');
    expect(html).not.toContain('Set up demo');
    expect(html).toContain(`${label} is turned off for this installation.`);
    expect(html).toContain('Demo data needs Search, Chat and Managed indexes.');
    expect(html).toContain(FEATURES);
  });

  it('gives a role that is not an Admin the note without the Settings link', () => {
    uiAccess.hold('setup:run');
    uiAccess.areasOff('chat');
    const html = page();
    expect(html).toContain('Demo data needs Search, Chat and Managed indexes.');
    expect(html).not.toContain(FEATURES);
  });
});

describe('the Documentation Assistant card', () => {
  it('is replaced by the Help assistant note when it is off, and the demo data stays', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('help-assistant');
    const html = page();
    expect(html).toContain('Help assistant is turned off for this installation.');
    expect(html).not.toContain('Build the assistant');
    expect(html).toContain('Fashion Catalog');
  });
});

describe('the "what\'s next" links', () => {
  const step = (href: string) => renderToStaticMarkup(createElement(NextStep, { href, icon: Search, title: 'T', desc: 'd' }));

  it('link each page while its area is on', () => {
    uiAccess.asAdmin();
    for (const href of ['/playground/search', '/experiences', '/analytics/overview', '/analytics/traces']) expect(step(href)).toContain(`href="${href}"`);
  });

  it('drop the ones whose area is off', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('analytics', 'playground');
    expect(step('/analytics/overview')).toBe('');
    expect(step('/analytics/traces')).toBe('');
    expect(step('/playground/search')).toBe('');
    expect(step('/experiences')).toContain('href="/experiences"');
  });
});
