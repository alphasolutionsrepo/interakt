// src/app/analytics/traces/_lib/trace-message.test.ts

import { describe, expect, it } from 'vitest';

import { traceContent, traceMessage } from './trace-message';

describe('traceContent', () => {
  it('is a query for search experience traces and a message for chat', () => {
    expect(traceContent('search_experience.search')).toBe('query');
    expect(traceContent('search_experience.summary')).toBe('query');
    expect(traceContent('chat.ai_experience.turn')).toBe('message');
  });
});

describe('traceMessage', () => {
  it('is not stored when the trace has no query or message', () => {
    expect(traceMessage(null)).toEqual({ kind: 'not-stored' });
    expect(traceMessage(undefined)).toEqual({ kind: 'not-stored' });
  });

  it('is empty, not "not stored", when a blank one was stored', () => {
    expect(traceMessage('')).toEqual({ kind: 'empty' });
    expect(traceMessage('   ')).toEqual({ kind: 'empty' });
  });

  it('is the text, trimmed, otherwise', () => {
    expect(traceMessage('  denim jacket ')).toEqual({ kind: 'text', text: 'denim jacket' });
  });
});
