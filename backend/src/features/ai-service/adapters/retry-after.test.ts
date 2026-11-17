// src/features/ai-service/adapters/retry-after.test.ts

/** A provider's Retry-After, in seconds or as a date, read as the wait it asks for. */

import { describe, expect, it } from 'vitest';

import { retryAfterMs } from './types';

const answer = (retryAfter?: string) => new Response(null, { status: 429, headers: retryAfter ? { 'retry-after': retryAfter } : {} });

describe('retryAfterMs', () => {
  it.each([
    ['seconds', '3', 3000],
    ['fractional seconds', '1.5', 1500],
    ['a date 10 seconds ahead', new Date(1_000_000 + 10_000).toUTCString(), 10_000],
    ['a date already past', new Date(0).toUTCString(), 0],
  ])('reads %s', (_case, header, expected) => {
    expect(retryAfterMs(answer(header), 1_000_000)).toBe(expected);
  });

  it.each([['no header', undefined], ['something unreadable', 'soon']])('gives no wait for %s', (_case, header) => {
    expect(retryAfterMs(answer(header))).toBeUndefined();
  });
});
