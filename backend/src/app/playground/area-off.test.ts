// src/app/playground/area-off.test.ts

/**
 * Playground pages with another area off: the mode that needs it stays visible, disabled, with
 * the area note (never silently hidden).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { UnifiedSearchPlayground } from './unified-search/_components/UnifiedSearchPlayground';
import { WidgetPlayground } from './widget/_components/WidgetPlayground';

import { textOf } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryKey[0] === 'search-experiences'
      ? [{ id: 'e1', name: 'Shop', slug: 'shop', isActive: true, aiEnabled: true, indexCount: 1 }]
      : undefined,
    isLoading: false, error: null, refetch: () => {},
  }),
}));
vi.mock('@/app/ai-experiences/_lib/hooks/useAIExperiences', () => ({ useAIExperiences: () => ({ experiences: [], isLoading: false }) }));
vi.mock('@/app/search-experiences/_lib/hooks', () => ({
  useSearchExperiences: () => ({ experiences: [], isLoading: false }),
  useSearchExperience: () => ({ experience: undefined, isLoading: false }),
}));

const unified = () => renderToStaticMarkup(createElement(UnifiedSearchPlayground));
const widget = () => renderToStaticMarkup(createElement(WidgetPlayground));

describe('unified search playground', () => {
  it('shows the AI Summary card turned off, with the note, when AI summaries are off', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('ai-summaries');
    const html = unified();
    expect(html).toContain('AI Summary');
    expect(html).toContain('Turned off');
    expect(textOf(html)).toContain('AI summaries is turned off for this installation.');
  });

  it('shows no note with AI summaries on', () => {
    uiAccess.asAdmin();
    const html = unified();
    expect(html).not.toContain('Turned off');
    expect(html).not.toContain('turned off for this installation');
  });
});

describe('widget playground', () => {
  it('disables the Chat kind with the reason and opens on Search when Chat is off', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('chat');
    const html = widget();
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="Chat is turned off for this installation\."[^>]*>/);
    expect(html).toContain('Search Experience');
    expect(textOf(html)).toContain('Chat is turned off for this installation.');
  });

  it('has no note with both on', () => {
    uiAccess.asAdmin();
    expect(widget()).not.toContain('turned off for this installation');
  });
});
