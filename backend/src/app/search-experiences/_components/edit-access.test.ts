// src/app/search-experiences/_components/edit-access.test.ts

/**
 * A search experience's edit page: only an Admin changes the built-in help, so anyone else
 * opening the docs search's edit page is told why and linked back, instead of given a form whose
 * save the server would refuse. An Admin, or an editor on any other search experience, gets the
 * form.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchExperienceEdit } from './SearchExperienceEdit';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
// The form fills itself from the loaded experience in an effect, which a server render never
// runs; run this component's effects during render so the filled form (or the lock) shows
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useEffect: (fn: () => unknown) => { fn(); } };
});

let isBuiltIn = false;
vi.mock('../_lib/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/hooks')>()),
  useSearchExperience: () => ({
    experience: {
      id: 'x', name: 'Docs search', slug: 'docs', description: null, isActive: true, isBuiltIn, client: null,
      indexes: [], externalSources: [], allowedOrigins: [], telemetryDetailLevel: 'metadata', displayConfig: null,
      searchConfig: {}, aiConfig: { enabled: false, providerId: null, modelId: null, summary: { enabled: false, maxResultsForContext: 5 } },
      toolsConfig: { enabled: [], settings: {} },
      createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
    },
    isLoading: false, isError: false, updateExperience: async () => {}, isUpdating: false,
  }),
  useSlugAvailability: () => ({ isAvailable: true, isChecking: false }),
}));

const LOCK = 'You can&#x27;t change this';
const page = () => renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() },
  createElement(SearchExperienceEdit, { id: 'x', basePath: '/experiences/search', listPath: '/experiences' })));

describe("the built-in docs search's edit page", () => {
  beforeEach(() => { isBuiltIn = true; });

  it('tells an editor who is not an Admin why, with no form to save', () => {
    uiAccess.hold('search-experiences:view', 'search-experiences:edit');
    const html = page();
    expect(html).toContain(LOCK);
    expect(html).toContain('Only an Admin can change the built-in help.');
    expect(html).toContain('href="/experiences/search/x"');
    expect(html).not.toContain('No Changes');
  });

  it('is the form for an Admin', () => {
    uiAccess.asAdmin();
    const html = page();
    expect(html).toContain('No Changes'); // the form's save, before anything is changed
    expect(html).not.toContain(LOCK);
  });

  it('is the form for an editor on any other search experience', () => {
    isBuiltIn = false;
    uiAccess.hold('search-experiences:view', 'search-experiences:edit');
    const html = page();
    expect(html).toContain('No Changes');
    expect(html).not.toContain(LOCK);
  });
});
