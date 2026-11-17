// src/shared/ui/custom/help-search-wiring.test.ts

/**
 * The help drawer hands the docs search whether its route may be called: false with the Help
 * assistant off (the server refuses it then), true while on and while access is still loading.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HelpButton } from './HelpButton';

import { useDocsSearch } from '@/shared/help/useDocsSearch';
import { uiAccess, uiAccessLoading } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: () => {} }) }));
vi.mock('@/shared/help/useDocsSearch', () => ({
  useDocsSearch: vi.fn(() => ({ status: 'idle', hits: [], groups: [], tookMs: null, fallback: false, turnedOff: false })),
}));

const searchOnPassed = () => {
  vi.mocked(useDocsSearch).mockClear();
  renderToStaticMarkup(createElement(HelpButton));
  return vi.mocked(useDocsSearch).mock.calls[0][2];
};

describe('the help drawer’s docs search', () => {
  beforeEach(() => uiAccess.asAdmin());

  it('may call the search route while the Help assistant is on', () => {
    expect(searchOnPassed()).toBe(true);
  });

  it('may not with the Help assistant off, so titles are matched instead', () => {
    uiAccess.areasOff('help-assistant');
    expect(searchOnPassed()).toBe(false);
  });

  it('may while access is still loading', () => {
    uiAccessLoading();
    expect(searchOnPassed()).toBe(true);
  });
});
