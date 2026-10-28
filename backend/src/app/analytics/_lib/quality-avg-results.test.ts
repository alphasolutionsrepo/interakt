import { describe, expect, it } from 'vitest';

import { qualityAvgResults } from './quality-avg-results';

describe('quality score average results', () => {
  it('weights each query by the searches that ran, so failed ones add nothing', () => {
    // "jackets": 9 ran with 20 results each; "coats": 3 searches, all failed
    expect(qualityAvgResults([{ avgResults: 20, ranCount: 9 }, { avgResults: 0, ranCount: 0 }])).toBe(20);
  });

  it('is 0 when nothing ran', () => {
    expect(qualityAvgResults([{ avgResults: 0, ranCount: 0 }])).toBe(0);
  });
});
