// src/app/analytics/_components/RecentSearchesFeed.test.ts

/**
 * The recent searches feed names what ran each search the way the admin knows it: a visitor,
 * the AI's Search tool, another tool attached to the experience, or an AI feature's step.
 */

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { RecentSearchEvent } from '../_lib/hooks/useAnalytics';
import { RecentSearchesFeed } from './RecentSearchesFeed';

const event = (triggerType: string, triggerStep: string | null, query: string): RecentSearchEvent => ({
  id: crypto.randomUUID(), timestamp: new Date().toISOString(), query, searchType: 'lexical',
  triggerType, triggerStep, totalResults: 1, durationMs: 10, success: true,
});

describe('recent searches feed', () => {
  it('labels each search by who ran it and with which tool or step', () => {
    const html = renderToStaticMarkup(createElement(RecentSearchesFeed, {
      data: [
        event('user', null, 'linen shirt'),
        event('ai_tool', 'search', 'wedding dress'),
        event('ai_tool', null, 'old assistant search'),
        event('ai_tool', 'lookup', 'SKU-123'),
        event('ai_tool', 'enumerate', 'colours'),
        event('ai_step', 'query_interpretation', 'sizes'),
        event('ai_step', 'parameter_context', 'brands'),
        event('ai_step', 'field_values_legacy', 'fits'),
      ],
    }));

    expect(html).toContain('Visitor');
    expect(html.match(/>AI assistant</g)).toHaveLength(2);
    expect(html).toContain('AI assistant: Find Record');
    expect(html).toContain('AI assistant: List Values');
    expect(html).toContain('AI step: Query understanding');
    expect(html).toContain('AI step: Filter values');
    expect(html).toContain('AI step: Field values (earlier)');
  });

  it('shows what was searched under the visitor\'s words when query understanding changed it', () => {
    const html = renderToStaticMarkup(createElement(RecentSearchesFeed, {
      data: [
        { ...event('user', null, 'can you show me minimal shirts for summer'), searchedQuery: 'minimal shirts summer' },
        event('user', null, 'linen shirt'),
      ],
    }));
    expect(html).toContain('can you show me minimal shirts for summer');
    expect(html).toContain('searched as “minimal shirts summer”');
    expect(html.match(/searched as/g)).toHaveLength(1);
  });

  it('says a search ran with filters only when every word of the question became a filter', () => {
    const html = renderToStaticMarkup(createElement(RecentSearchesFeed, {
      data: [{ ...event('user', null, 'red dresses under 50'), searchedQuery: '' }],
    }));
    expect(html).toContain('red dresses under 50');
    expect(html).toContain('searched with filters only');
    expect(html).not.toContain('searched as');
  });
});
