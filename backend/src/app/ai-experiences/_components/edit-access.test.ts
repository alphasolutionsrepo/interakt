// src/app/ai-experiences/_components/edit-access.test.ts

/**
 * A chat experience's edit page: only an Admin changes the built-in help, so anyone else opening
 * the Help Assistant's edit page is told why and linked back, instead of given a form whose save
 * the server would refuse. An Admin, or an editor on any other chat experience, gets the form.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIExperienceEdit } from './AIExperienceEdit';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));

let isBuiltIn = false;
vi.mock('../_lib/hooks/useAIExperiences', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/hooks/useAIExperiences')>()),
  useAIExperience: () => ({
    experience: {
      id: 'e', isBuiltIn, name: 'Help Assistant', slug: 'help', description: null, icon: null, pipelineMode: 'deterministic',
      executionPolicy: null, pipelineConfig: null, personaConfig: {}, sessionConfig: {}, accessConfig: {}, observabilityConfig: {},
      guardrailConfig: null, providerId: null, modelId: null, isActive: true, tools: [],
      createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
    },
    isLoading: false, updateExperience: async () => {}, isUpdating: false, refetch: () => {},
    assignTool: async () => {}, updateToolAssignment: async () => {}, removeTool: async () => {}, isAssigningTool: false, isRemovingTool: false,
  }),
}));

const LOCK = 'You can&#x27;t change this';
const page = () => renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() },
  createElement(AIExperienceEdit, { id: 'e', basePath: '/experiences/ai', listPath: '/experiences' })));

describe("the built-in Help Assistant's edit page", () => {
  beforeEach(() => { isBuiltIn = true; });

  it('tells an editor who is not an Admin why, with no form to save', () => {
    uiAccess.hold('ai-experiences:view', 'ai-experiences:edit');
    const html = page();
    expect(html).toContain(LOCK);
    expect(html).toContain('Only an Admin can change the built-in help.');
    expect(html).toContain('href="/experiences/ai/e"');
    expect(html).not.toContain('Save Changes');
  });

  it('is the form for an Admin', () => {
    uiAccess.asAdmin();
    const html = page();
    expect(html).toContain('Edit Help Assistant');
    expect(html).toContain('Save Changes');
    expect(html).not.toContain(LOCK);
  });

  it('is the form for an editor on any other chat experience', () => {
    isBuiltIn = false;
    uiAccess.hold('ai-experiences:view', 'ai-experiences:edit');
    const html = page();
    expect(html).toContain('Save Changes');
    expect(html).not.toContain(LOCK);
  });
});
