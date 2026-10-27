// src/features/analytics/analytics-source-context.ts

/**
 * Where the work in progress came from (a visitor through the API, an admin test chat, the
 * playground), carried through a request without passing it down every call. The chat pipeline
 * and the tool Test panel set it; searches, AI calls and tool executions read it when they are
 * recorded, so reports can leave test traffic out.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

import type { AnalyticsSource } from './analytics.types';

const analyticsSourceStore = new AsyncLocalStorage<AnalyticsSource>();

/** Run a function with everything it records tagged with `source`. */
export function withAnalyticsSource<T>(source: AnalyticsSource, fn: () => T): T {
  return analyticsSourceStore.run(source, fn);
}

/** The current source, or undefined outside any (recorded as live traffic, 'api'). */
export function getAnalyticsSourceContext(): AnalyticsSource | undefined {
  return analyticsSourceStore.getStore();
}
