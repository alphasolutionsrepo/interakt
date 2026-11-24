import { describe, expect, it } from 'vitest';

import { rateLimitConfigSchema } from './search-experience.schemas';

describe('search experience rate limit settings', () => {
  it('takes a summaries-per-minute limit, which may be left out', () => {
    expect(rateLimitConfigSchema.parse({ searchPerMinute: 60, summaryPerMinute: 10 })).toEqual({ searchPerMinute: 60, summaryPerMinute: 10 });
    expect(rateLimitConfigSchema.parse({ searchPerMinute: 60 })).toEqual({ searchPerMinute: 60 });
  });

  it('refuses a summary limit outside 1 to 500 a minute', () => {
    expect(rateLimitConfigSchema.safeParse({ searchPerMinute: 60, summaryPerMinute: 0 }).success).toBe(false);
    expect(rateLimitConfigSchema.safeParse({ searchPerMinute: 60, summaryPerMinute: 501 }).success).toBe(false);
  });

  it('still accepts settings sent with the old chatPerMinute, and drops it', () => {
    expect(rateLimitConfigSchema.parse({ searchPerMinute: 60, chatPerMinute: 30 })).toEqual({ searchPerMinute: 60 });
  });
});
