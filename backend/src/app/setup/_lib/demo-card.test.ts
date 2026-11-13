// app/setup/_lib/demo-card.test.ts

import { describe, expect, it } from 'vitest';

import { demoCardView } from './demo-card';

describe('demoCardView', () => {
  it('shows the full card when the areas are on, seeded or not', () => {
    expect(demoCardView({ seeded: false, areasNeededOn: true })).toBe('full');
    expect(demoCardView({ seeded: true, areasNeededOn: true })).toBe('full');
  });
  it('shows the note and the remove card when an area is off and demo data exists', () => {
    expect(demoCardView({ seeded: true, areasNeededOn: false })).toBe('remove');
  });
  it('shows only the note when an area is off and there is no demo data', () => {
    expect(demoCardView({ seeded: false, areasNeededOn: false })).toBe('note');
  });
});
