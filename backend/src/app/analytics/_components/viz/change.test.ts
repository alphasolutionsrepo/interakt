// app/analytics/_components/viz/change.test.ts

/**
 * Change since the previous period: percentages for counts and durations,
 * points for rates, and good or bad only where the figure has a better direction.
 */

import { describe, expect, it } from 'vitest';

import { compareRates, compareValues } from './change';

describe('compareValues', () => {
  it('gives the percentage change, neutral unless told which way is better', () => {
    expect(compareValues(112, 100)).toEqual({ direction: 'up', amount: '12%', sentiment: 'neutral' });
    expect(compareValues(80, 100, { higherIsBetter: false })).toEqual({ direction: 'down', amount: '20%', sentiment: 'good' });
    expect(compareValues(130, 100, { higherIsBetter: false })).toEqual({ direction: 'up', amount: '30%', sentiment: 'bad' });
  });

  it('calls a change under half a percent flat', () => {
    expect(compareValues(1002, 1000, { higherIsBetter: true })).toEqual({ direction: 'flat', amount: '0%', sentiment: 'neutral' });
  });

  it('switches to a multiple past ten times', () => {
    expect(compareValues(420, 30)?.amount).toBe('14×');
  });

  it('has nothing to say when the previous period was empty', () => {
    expect(compareValues(50, 0)).toBeNull();
  });
});

describe('compareRates', () => {
  it('gives the change in points, to one decimal under 10', () => {
    expect(compareRates(0.947, 0.97, { higherIsBetter: true })).toEqual({ direction: 'down', amount: '2.3 pts', sentiment: 'bad' });
    expect(compareRates(0.6, 0.4, { higherIsBetter: true })).toEqual({ direction: 'up', amount: '20 pts', sentiment: 'good' });
    expect(compareRates(0.51, 0.5)?.amount).toBe('1 pt');
  });

  it('has nothing to say when either period has no rate', () => {
    expect(compareRates(0.9, null)).toBeNull();
  });
});
