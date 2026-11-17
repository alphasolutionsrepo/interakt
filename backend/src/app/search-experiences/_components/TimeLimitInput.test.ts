// src/app/search-experiences/_components/TimeLimitInput.test.ts

/** What the time limit field saves while the admin is still typing: nothing until it reads as a number in range. */

import { describe, expect, it } from 'vitest';

import { typedTimeoutMs } from './TimeLimitInput';

describe('typedTimeoutMs', () => {
  it('saves nothing for a half-typed or out-of-range value, so the field is not overwritten', () => {
    for (const text of ['', ' ', '0', '0.', '0.2', '11', 'abc']) expect(typedTimeoutMs(text)).toBeNull();
  });

  it('saves seconds in range as ms', () => {
    expect(typedTimeoutMs('0.5')).toBe(500);
    expect(typedTimeoutMs('0.75')).toBe(750);
    expect(typedTimeoutMs('2')).toBe(2000);
    expect(typedTimeoutMs('10')).toBe(10000);
  });
});
