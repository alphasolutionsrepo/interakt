// src/app/search-experiences/_components/areas-off.test.ts

/**
 * Search experiences with AI summaries turned off keep their summary settings, visible and
 * disabled with the reason; links to Managed indexes disappear while the source stays.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { StepAIConfig } from './CreateWizard/StepAIConfig';
import { ExperienceSources } from './ExperienceSources';
import { SummaryAreaGuard } from './SummaryAreaGuard';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@/shared/ui/custom/ProviderModelSelect', () => ({ ProviderModelSelect: () => 'PROVIDER' }));
vi.mock('./CreateWizard/CustomInstructionsGenerator', () => ({ CustomInstructionsGenerator: () => null }));

const guard = () => renderToStaticMarkup(createElement(SummaryAreaGuard, null, createElement('input', { defaultValue: '12' })));

const step = () => renderToStaticMarkup(createElement(StepAIConfig, {
  formData: { indexes: [], externalSources: [], aiConfig: { enabled: true, summary: { enabled: true, maxResultsForContext: 12, maxTokens: 700 }, queryUnderstanding: { enabled: false } } },
  errors: {}, updateField: () => {},
} as never));

const sources = () => renderToStaticMarkup(createElement(ExperienceSources, {
  selectedIndexes: [{ searchIndexId: 'idx-1', role: 'primary' }],
  selectedExternal: [],
  indexOptions: [{ id: 'idx-1', name: 'products', displayName: 'Products', searchType: 'lexical', searchProvider: 'elasticsearch' }],
  externalOptions: [],
  isLoading: false,
  onAddIndex: () => {}, onRemoveIndex: () => {}, onRoleChange: () => {}, onAddExternal: () => {}, onRemoveExternal: () => {},
} as never));

describe('the summary settings with AI summaries off', () => {
  it('stay visible and disabled, with the note', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('ai-summaries');
    const html = guard();
    expect(html).toContain('<fieldset disabled');
    expect(html).toContain('value="12"');
    expect(html).toContain('AI summaries is turned off for this installation.');
    expect(html).toContain('apply again when AI summaries is on');
  });

  it('are plain and noteless with AI summaries on', () => {
    uiAccess.asAdmin();
    const html = guard();
    expect(html).not.toContain('fieldset');
    expect(html).not.toContain('turned off');
    expect(html).toContain('value="12"');
  });

  it('keep the wizard’s AI step values, disabled with the note', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('ai-summaries');
    const html = step();
    expect(html).toContain('<fieldset disabled');
    expect(html).toContain('value="12"');
    expect(html).toContain('value="700"');
    expect(html).toContain('AI summaries is turned off');
  });
});

describe('a search experience’s sources with Managed indexes off', () => {
  it('show the index without a link', () => {
    uiAccess.hold('search-experiences:edit', 'search-indexes:view');
    uiAccess.areasOff('managed-indexes');
    const html = sources();
    expect(html).toContain('Products');
    expect(html).not.toContain('href="/search-indexes');
  });

  it('link it with the area on', () => {
    uiAccess.hold('search-experiences:edit', 'search-indexes:view');
    expect(sources()).toContain('href="/search-indexes/idx-1"');
  });
});
