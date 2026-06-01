// src/features/embedding/vector-math.test.ts

import { describe, it, expect } from 'vitest';
import { cosineSimilarity, maxCosineSimilarity } from './vector-math';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 10);
  });

  it('returns -1 for opposite vectors', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 10);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = [1, 0];
    const b = [0, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 10);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('returns 0 for zero vector', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('handles normalized vectors correctly', () => {
    const a = [1 / Math.sqrt(2), 1 / Math.sqrt(2)];
    const b = [1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1 / Math.sqrt(2), 10);
  });
});

describe('maxCosineSimilarity', () => {
  it('finds the best match among candidates', () => {
    const query = [1, 0, 0];
    const candidates = [
      [0, 1, 0], // orthogonal
      [1, 0, 0], // identical
      [0, 0, 1], // orthogonal
    ];
    const { maxSimilarity, bestIndex } = maxCosineSimilarity(query, candidates);
    expect(maxSimilarity).toBeCloseTo(1, 10);
    expect(bestIndex).toBe(1);
  });

  it('returns -1 and -1 for empty candidates', () => {
    const { maxSimilarity, bestIndex } = maxCosineSimilarity([1, 0], []);
    expect(maxSimilarity).toBe(-1);
    expect(bestIndex).toBe(-1);
  });

  it('picks the highest similarity when all are partial matches', () => {
    const query = [1, 1];
    const candidates = [
      [1, 0],   // ~0.707
      [0.9, 1], // ~0.997
      [0, 1],   // ~0.707
    ];
    const { bestIndex } = maxCosineSimilarity(query, candidates);
    expect(bestIndex).toBe(1);
  });
});
