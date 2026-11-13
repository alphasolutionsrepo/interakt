// src/app/setup/demo-remove-path.test.ts

/**
 * Initial Setup when demo data is already seeded: with an area the demo needs off, the page
 * shows the remove card and not the set-up card; with every area on it shows the set-up card.
 * The page loads its status in an effect, which a static render never runs, so the status
 * state starts as a seeded one (it is the page's first state).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SetupDemoPage from './page';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

let seeded = true;
let calls = 0;
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: <T,>(initial: T) => {
      calls += 1;
      const status = {
        seeded, seededProvider: 'ollama', manifest: { documents: 200 },
        providers: { recommended: 'ollama', options: [] },
      };
      return actual.useState(calls === 1 ? (status as T) : initial);
    },
  };
});

const page = () => { calls = 0; return renderToStaticMarkup(createElement(SetupDemoPage)); };
const REMOVE = 'You can remove it here.';

describe('Initial Setup with demo data seeded', () => {
  beforeEach(() => { seeded = true; uiAccess.asAdmin(); });

  it.each(['search', 'chat', 'managed-indexes'] as const)('shows the remove card, not the set-up card, when %s is off', (area) => {
    uiAccess.areasOff(area);
    const html = page();
    expect(html).toContain(REMOVE);
    expect(html).toContain('Reset');
    expect(html).not.toContain('Set up demo');
    expect(html).not.toContain('1. Choose your AI provider');
    expect(html).toContain('Demo data needs Search, Chat and Managed indexes.');
  });

  it('shows the set-up card, and no remove card, with every area on', () => {
    const html = page();
    expect(html).toContain('1. Choose your AI provider');
    expect(html).not.toContain(REMOVE);
  });

  it('shows only the note when nothing was seeded and an area is off', () => {
    seeded = false;
    uiAccess.areasOff('chat');
    const html = page();
    expect(html).not.toContain(REMOVE);
    expect(html).toContain('Demo data needs Search, Chat and Managed indexes.');
  });
});
