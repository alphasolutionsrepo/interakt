// src/app/search-experiences/_components/CreateWizard/CustomInstructionsGenerator/area-off.test.ts

/** Generate Instructions needs AI summaries: locked with the reason when that area is off. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { CustomInstructionsGenerator } from './CustomInstructionsGenerator';

import { controlState } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@/components/ui/dialog', async () => (await import('@/shared/test/open-overlays-stub')).dialog);

const dialog = () => renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() },
  createElement(CustomInstructionsGenerator, {
    open: true, onOpenChange: () => {}, experienceName: 'Shop', indexIds: ['i1'], type: 'chat', onApply: () => {},
  })));

describe('Generate Instructions with AI summaries off', () => {
  it('stays visible but locked with the reason, even for an Admin', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('ai-summaries');
    const html = dialog();
    expect(controlState(html, { text: 'Generate Instructions' })).toBe('locked');
    expect(html).toContain('AI summaries is turned off for this installation.');
  });

  it('stays open with the area on, and Playground off does not matter', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('playground');
    expect(controlState(dialog(), { text: 'Generate Instructions' })).toBe('open');
  });
});
