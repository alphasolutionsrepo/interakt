// src/features/feature-switches/analytics-section-areas.ts

import type { Area } from './areas';

/**
 * The feature areas each analytics section needs beyond Analytics itself (all of `all`, one of
 * `anyOf`). The one table behind both the section nav (app/analytics/_lib/sections.ts) and the
 * page rules (page-areas.ts). A section not listed needs only Analytics. Safe to import from client code.
 */

export type AreaNeeds = { all?: readonly Area[]; anyOf?: readonly Area[] };

export const ANALYTICS_SECTION_NEEDS = {
  '/analytics/search': { all: ['search'] },
  '/analytics/conversations': { all: ['chat'] },
  '/analytics/ai': { all: ['chat'] },
  '/analytics/traces': { anyOf: ['search', 'chat'] },
} as const satisfies Record<string, AreaNeeds>;
