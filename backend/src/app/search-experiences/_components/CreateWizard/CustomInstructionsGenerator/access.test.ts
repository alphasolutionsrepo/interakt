// src/app/search-experiences/_components/CreateWizard/CustomInstructionsGenerator/access.test.ts

/**
 * Generate Instructions runs the playground's AI for real, so it is locked with the reason for a
 * role without playground:use, and open for one with it.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { CustomInstructionsGenerator } from './CustomInstructionsGenerator';

import { controlState } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@/components/ui/dialog', async () => (await import('@/shared/test/open-overlays-stub')).dialog);

const generate = { text: 'Generate Instructions' };
const dialog = () => renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() },
  createElement(CustomInstructionsGenerator, {
    open: true, onOpenChange: () => {}, experienceName: 'Shop', indexIds: ['i1'], type: 'chat', onApply: () => {},
  })));

describe('Generate Instructions', () => {
  it('is locked with the reason for a role without playground:use', () => {
    uiAccess.hold('search-experiences:view', 'search-experiences:edit');
    const html = dialog();
    expect(controlState(html, generate)).toBe('locked');
    expect(html).toContain('You don&#x27;t have permission to generate instructions with AI.');
  });

  it('is open for a role with playground:use', () => {
    uiAccess.hold('playground:use');
    expect(controlState(dialog(), generate)).toBe('open');
  });
});

// Regenerate shows once instructions exist, which a server render reaches only by starting
// the "generated" state filled: stub useState so a null starting value becomes some text
describe('Regenerate', () => {
  it('is locked with the reason without playground:use and open with it', async () => {
    vi.resetModules();
    vi.doMock('react', async (importOriginal) => {
      const actual = await importOriginal<typeof import('react')>();
      return { ...actual, useState: <T,>(initial: T) => actual.useState(initial === (null as T) ? ('Generated text' as T) : initial) };
    });
    const { CustomInstructionsGenerator: Generator } = await import('./CustomInstructionsGenerator');
    const { useAccessModule } = await import('@/shared/test/ui-access-stub');
    expect(useAccessModule).toBeDefined();
    const render = () => renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() },
      createElement(Generator, { open: true, onOpenChange: () => {}, experienceName: 'Shop', indexIds: ['i1'], type: 'chat', onApply: () => {} })));
    uiAccess.hold('search-experiences:edit');
    expect(controlState(render(), { text: 'Regenerate' })).toBe('locked');
    uiAccess.hold('playground:use');
    expect(controlState(render(), { text: 'Regenerate' })).toBe('open');
    vi.doUnmock('react');
  });
});
