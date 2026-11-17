// src/app/search-experiences/_components/query-understanding-settings.test.ts

/**
 * The query understanding settings: the time limit, typed in seconds and explained,
 * and the note that external indexes get search terms. With AI summaries off they stay
 * visible and disabled with the reason, like the other AI settings.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { StepAIConfig } from './CreateWizard/StepAIConfig';
import { SearchExperienceDetail } from './SearchExperienceDetail';
import { AiTab } from './SearchExperienceEdit';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => '/' }));
vi.mock('@/shared/ui/custom/ProviderModelSelect', () => ({ ProviderModelSelect: () => 'PROVIDER' }));
vi.mock('./CreateWizard/CustomInstructionsGenerator', () => ({ CustomInstructionsGenerator: () => null }));
vi.mock('./SearchWidgetCard', () => ({ SearchWidgetCard: () => null }));
vi.mock('@/app/experiences/_components/ExperienceHeaderActions', () => ({ ExperienceHeaderActions: () => null }));
// The detail page's cards start collapsed; open them so their summary renders
vi.mock('@/shared/ui/custom/CollapsibleCard', async () => {
  const { createElement: h, Fragment } = await import('react');
  return { CollapsibleCard: ({ children }: { children?: unknown }) => h(Fragment, null, children as never) };
});

const detailQu = vi.hoisted(() => ({ value: undefined as Record<string, unknown> | undefined }));
vi.mock('../_lib/hooks', () => ({
  useSearchExperience: () => ({
    experience: {
      id: 'e1', name: 'Site', slug: 'site', description: '', isActive: true, isBuiltIn: false, allowedOrigins: [],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', indexes: [], externalSources: [],
      searchConfig: {
        defaultPageSize: 10, maxPageSize: 50, enableHighlighting: true, enableFacets: true,
        multiIndexStrategy: 'parallel', resultMergeStrategy: 'rrf', maxIndexesPerQuery: 3,
      },
      aiConfig: { enabled: true, summary: { enabled: true, maxResultsForContext: 12, maxTokens: 700 }, queryUnderstanding: detailQu.value },
    },
    isLoading: false, isError: false, deleteExperience: async () => {}, isDeleting: false,
    updateExperience: async () => {}, isUpdating: false, regenerateToken: async () => {}, isRegeneratingToken: false,
  }),
}));

const noop = () => {};
const queryUnderstanding = (timeoutMs?: number) => ({ enabled: true, minWords: 3, ...(timeoutMs !== undefined && { timeoutMs }) });

const aiTab = (timeoutMs?: number) =>
  renderToStaticMarkup(createElement(AiTab, {
    formData: {
      aiConfig: {
        enabled: true, providerId: null, modelId: null,
        summary: { enabled: true, maxResultsForContext: 12, maxTokens: 700 },
        queryUnderstanding: queryUnderstanding(timeoutMs),
      },
    },
    experience: { indexes: [] },
    updateAIConfig: noop, updateSummaryConfig: noop, updateQueryUnderstandingConfig: noop,
    onProviderModelChange: noop, summaryInstructionsOpen: false, setSummaryInstructionsOpen: noop,
    onOpenSummaryGenerator: noop,
  } as never));

const wizardStep = (timeoutMs?: number) => renderToStaticMarkup(createElement(StepAIConfig, {
  formData: {
    indexes: [], externalSources: [],
    aiConfig: { enabled: true, summary: { enabled: true, maxResultsForContext: 12, maxTokens: 700 }, queryUnderstanding: queryUnderstanding(timeoutMs) },
  },
  errors: {}, updateField: noop,
} as never));

const EXPLANATION = 'When the limit is reached, search goes on with the visitor&#x27;s own words.';
const EXTERNAL_NOTE = 'For external indexes, it rewrites the visitor&#x27;s question';

describe.each([
  ['the edit page’s AI tab', aiTab],
  ['the create wizard’s AI step', wizardStep],
])('%s', (_name, render) => {
  it('shows the time limit in seconds with its explanation', () => {
    uiAccess.asAdmin();
    const html = render(1500);
    expect(html).toContain('Time Limit (seconds)');
    expect(html).toMatch(/id="queryUnderstandingTimeLimit"[^>]*value="1.5"/);
    expect(html).toContain(EXPLANATION);
    expect(html).toContain(EXTERNAL_NOTE);
  });

  it('shows 3 seconds when no limit is saved', () => {
    uiAccess.asAdmin();
    expect(render()).toMatch(/id="queryUnderstandingTimeLimit"[^>]*value="3"/);
  });

  it('keeps the limit visible and disabled with the reason when AI summaries is off', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('ai-summaries');
    const html = render(1500);
    expect(html).toContain('<fieldset disabled');
    expect(html).toContain('AI summaries is turned off for this installation.');
    expect(html).toMatch(/id="queryUnderstandingTimeLimit"[^>]*value="1.5"/);
  });
});

describe('the detail page', () => {
  it('shows the time limit with query understanding on', () => {
    uiAccess.asAdmin();
    detailQu.value = queryUnderstanding(1500);
    expect(renderToStaticMarkup(createElement(SearchExperienceDetail, { id: 'e1' }))).toContain('Enabled · min 3 words · 1.5 s time limit');
  });

  it('shows 3 s when no limit is saved', () => {
    uiAccess.asAdmin();
    detailQu.value = queryUnderstanding();
    expect(renderToStaticMarkup(createElement(SearchExperienceDetail, { id: 'e1' }))).toContain('· 3 s time limit');
  });
});
