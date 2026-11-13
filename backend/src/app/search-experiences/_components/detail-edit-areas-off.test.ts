// src/app/search-experiences/_components/detail-edit-areas-off.test.ts

/**
 * The search experience's own screens with AI summaries off: the detail page's AI Summary card
 * carries the note, and the edit page's AI tab is wrapped in the guard (disabled, values kept).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { SearchExperienceDetail } from './SearchExperienceDetail';
import { AiTab } from './SearchExperienceEdit';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => '/' }));
vi.mock('@/shared/ui/custom/ProviderModelSelect', () => ({ ProviderModelSelect: () => 'PROVIDER' }));
vi.mock('./CreateWizard/CustomInstructionsGenerator', () => ({ CustomInstructionsGenerator: () => null }));
vi.mock('./SearchWidgetCard', () => ({ SearchWidgetCard: () => null }));
vi.mock('@/app/experiences/_components/ExperienceHeaderActions', () => ({ ExperienceHeaderActions: () => null }));
vi.mock('../_lib/hooks', () => ({
  useSearchExperience: () => ({
    experience: {
      id: 'e1', name: 'Shop', slug: 'shop', description: '', isActive: true, isBuiltIn: false, allowedOrigins: [],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', indexes: [], externalSources: [],
      searchConfig: {
        defaultPageSize: 10, maxPageSize: 50, enableHighlighting: true, enableFacets: true,
        multiIndexStrategy: 'parallel', resultMergeStrategy: 'rrf', maxIndexesPerQuery: 3,
      },
      aiConfig: { enabled: true, summary: { enabled: true, maxResultsForContext: 12, maxTokens: 700 } },
    },
    isLoading: false, isError: false, deleteExperience: async () => {}, isDeleting: false,
    updateExperience: async () => {}, isUpdating: false, regenerateToken: async () => {}, isRegeneratingToken: false,
  }),
}));

const detail = () => renderToStaticMarkup(createElement(SearchExperienceDetail, { id: 'e1' }));

const noop = () => {};
const aiTab = (instructions?: string) =>
  renderToStaticMarkup(createElement(AiTab, {
    formData: {
      aiConfig: {
        enabled: true, providerId: null, modelId: null,
        summary: { enabled: true, maxResultsForContext: 12, maxTokens: 700, customInstructions: instructions },
        queryUnderstanding: { enabled: false, minWords: 3 },
      },
    },
    experience: { indexes: [] },
    updateAIConfig: noop, updateSummaryConfig: noop, updateQueryUnderstandingConfig: noop,
    onProviderModelChange: noop, summaryInstructionsOpen: false, setSummaryInstructionsOpen: noop,
    onOpenSummaryGenerator: noop,
  } as never));

describe('the search experience detail page', () => {
  it('shows the AI summaries note in the AI Summary card when AI summaries is off, values still shown', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('ai-summaries');
    const html = detail();
    expect(html).toContain('AI summaries is turned off for this installation.');
    expect(html).toContain('apply again when AI summaries is on');
    expect(html).toContain('AI Summary');
    expect(html).toContain('>On<');
  });

  it('has no note with AI summaries on', () => {
    uiAccess.asAdmin();
    const html = detail();
    expect(html).toContain('AI Summary');
    expect(html).not.toContain('turned off');
  });
});

describe('the search experience edit page’s AI tab', () => {
  it('is disabled with the note, values kept, when AI summaries is off', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('ai-summaries');
    const html = aiTab();
    expect(html).toContain('<fieldset disabled');
    expect(html).toContain('AI summaries is turned off for this installation.');
    expect(html).toContain('value="12"');
    expect(html).toContain('value="700"');
  });

  it('shows saved custom instructions, read-only, though their section is collapsed, when AI summaries is off', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('ai-summaries');
    const html = aiTab('Answer in a friendly tone');
    expect(html).toContain('Answer in a friendly tone');
    expect(html).toContain('<fieldset disabled');
  });

  it('keeps the custom instructions collapsed with AI summaries on', () => {
    uiAccess.asAdmin();
    expect(aiTab('Answer in a friendly tone')).not.toContain('Answer in a friendly tone');
  });

  it('is plain and editable with AI summaries on', () => {
    uiAccess.asAdmin();
    const html = aiTab();
    expect(html).not.toContain('fieldset');
    expect(html).not.toContain('turned off');
    expect(html).toContain('value="12"');
  });
});
