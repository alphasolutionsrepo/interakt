// src/app/analytics/traces/_components/SearchRequestDetail.query-understanding.test.ts

/**
 * A search request's trace shows its query understanding steps by name, with their outcome and
 * what they produced, and a step that reached its time limit reads as failed with its reason.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { SpanDetail, SpanListItem } from '../_lib/api-client';

import { SearchRequestBody } from './SearchRequestDetail';

import { ATTR } from '@/features/telemetry/attribute-keys';

const START = '2026-11-17T02:00:00.000Z';

function span(id: string, operationName: string, attributes: Record<string, unknown>, status: { code?: string; message?: string } = {}): SpanDetail {
  return {
    id, traceId: 't', spanId: id, parentSpanId: id === 'root' ? null : 'root', operationName,
    serviceName: 'interakt', spanKind: 'internal', startTime: START, endTime: START, durationMs: 100,
    statusCode: status.code ?? 'OK', statusMessage: status.message ?? null, experienceId: 'exp', experienceType: 'search',
    attributes, events: [], createdAt: START,
  } as SpanDetail;
}

function render(steps: SpanDetail[]): string {
  const root = span('root', 'search_experience.search', {});
  return renderToStaticMarkup(createElement(SearchRequestBody, { rootSpan: root as SpanListItem, spans: [root, ...steps] }));
}

describe('query understanding steps on a search trace', () => {
  it('labels the filter step with its outcome, filters added and the query searched', () => {
    const html = render([span('i', 'query_understanding.interpretation', {
      [ATTR.QUERY_INTERPRETATION_OUTCOME]: 'interpreted',
      [ATTR.QUERY_INTERPRETATION_FILTERS_ADDED]: 5,
      [ATTR.QUERY_INTERPRETATION_QUERY]: 'red linen summer dresses',
    })]);
    expect(html).toContain('Query understanding (filters)');
    expect(html).toMatch(/Outcome: <span[^>]*>interpreted</);
    expect(html).toMatch(/Filters added: <span[^>]*>5</);
    expect(html).toMatch(/Query searched: <span[^>]*>red linen summer dresses</);
  });

  it('labels the search-terms step with its outcome and the terms sent', () => {
    const html = render([span('r', 'query_understanding.rewrite', {
      [ATTR.QUERY_REWRITE_OUTCOME]: 'rewritten',
      [ATTR.QUERY_REWRITE_REWRITTEN]: 'minimal style shirts summer',
    })]);
    expect(html).toContain('Query understanding (search terms)');
    expect(html).toMatch(/Outcome: <span[^>]*>rewritten</);
    expect(html).toMatch(/Search terms: <span[^>]*>minimal style shirts summer</);
  });

  it('shows a step past its time limit as failed, with the reason', () => {
    const html = render([span('i', 'query_understanding.interpretation', { [ATTR.QUERY_INTERPRETATION_OUTCOME]: 'timed_out' }, {
      code: 'ERROR', message: "Query interpretation reached its time limit; searched with the visitor's words",
    })]);
    expect(html).toContain('Failed');
    expect(html).toMatch(/Outcome: <span[^>]*>timed_out</);
    expect(html).toContain('reached its time limit');
  });
});
