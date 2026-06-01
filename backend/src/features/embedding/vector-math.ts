// src/features/embedding/vector-math.ts

/**
 * Vector Math Utilities
 *
 * Pure math functions for in-memory vector operations.
 * Used when comparing vectors outside of pgvector (e.g., cached embeddings).
 */

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1, where 1 = identical direction.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Find the maximum cosine similarity between a query vector and a set of candidates.
 * Returns the best match score and index.
 */
export function maxCosineSimilarity(
  query: number[],
  candidates: number[][],
): { maxSimilarity: number; bestIndex: number } {
  let maxSimilarity = -1;
  let bestIndex = -1;

  for (let i = 0; i < candidates.length; i++) {
    const sim = cosineSimilarity(query, candidates[i]);
    if (sim > maxSimilarity) {
      maxSimilarity = sim;
      bestIndex = i;
    }
  }

  return { maxSimilarity, bestIndex };
}
