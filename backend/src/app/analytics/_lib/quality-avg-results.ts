// src/app/analytics/_lib/quality-avg-results.ts

import type { PopularQuery } from './hooks/useAnalytics';

/**
 * Average results across the top queries for the quality score, weighted by how often each query
 * ran. Failed searches are left out: a query's avgResults averages only the searches that ran.
 */
export function qualityAvgResults(queries: Array<Pick<PopularQuery, 'avgResults' | 'ranCount'>>): number {
  const ran = queries.reduce((sum, q) => sum + q.ranCount, 0);
  return ran > 0 ? queries.reduce((sum, q) => sum + q.avgResults * q.ranCount, 0) / ran : 0;
}
