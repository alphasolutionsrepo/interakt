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
// What each query / hook was asked (`enabled`), so "no request" is checkable without a DOM
const asked = vi.hoisted(() => ({ queries: {} as Record<string, unknown>, hooks: {} as Record<string, unknown> }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey, enabled }: { queryKey: unknown[]; enabled?: boolean }) => {
    asked.queries[String(queryKey[0]) + ':' + String(queryKey[1])] = enabled;
    return {
      data: queryKey[0] === 'search-experiences'
        ? [{ id: 'e1', name: 'Shop', slug: 'shop', isActive: true, aiEnabled: true, indexCount: 1 }]
        : undefined,
      isLoading: false, error: null, refetch: () => {},
    };
  },
}));
vi.mock('@/app/ai-experiences/_lib/hooks/useAIExperiences', () => ({
  useAIExperiences: (_p: unknown, o?: { enabled?: boolean }) => {
    asked.hooks.ai = o?.enabled;
    return { experiences: [], isLoading: false };
  },
}));
vi.mock('@/app/search-experiences/_lib/hooks', () => ({
  useSearchExperiences: (_p: unknown, o?: { enabled?: boolean }) => {
    asked.hooks.search = o?.enabled;
    return { experiences: [], isLoading: false };
  },
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

describe('requests with an area off', () => {
  it('the widget playground asks only for the lists of kinds that are on', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('chat');
    widget();
    expect(asked.hooks).toEqual({ ai: false, search: true });
    uiAccess.asAdmin();
    uiAccess.areasOff('search');
    widget();
    expect(asked.hooks).toEqual({ ai: true, search: false });
    uiAccess.asAdmin();
    widget();
    expect(asked.hooks).toEqual({ ai: true, search: true });
  });

  it('the experience search tab asks for no experience routes with Search off, and says so', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('search');
    const html = unified();
    expect(asked.queries['search-experiences:playground']).toBe(false);
    expect(textOf(html)).toContain('Search is turned off for this installation.');
    uiAccess.asAdmin();
    unified();
    expect(asked.queries['search-experiences:playground']).toBe(true);
  });
});
