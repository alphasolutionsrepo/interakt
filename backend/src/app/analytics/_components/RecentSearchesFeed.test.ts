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
});
