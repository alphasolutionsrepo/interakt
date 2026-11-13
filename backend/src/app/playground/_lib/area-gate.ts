// src/app/playground/_lib/area-gate.ts

/**
 * Test buttons follow two things: the permission to test (an ActionGate) and the feature area
 * the test needs (Playground, or the area being tested). When an area is off the button stays
 * visible but locked with the same reason the area note gives, like a permission lock.
 */

'use client';

import type { Area } from '@/features/feature-switches/areas';
import type { OffReasons } from '@/features/feature-switches/off-causes';
import type { ActionGate } from '@/shared/access/ActionControls';
import { offAreasText } from '@/shared/access/AreaOffNote';
import { useAccess } from '@/shared/access/useAccess';

/**
 * The gate, or locked with the reason when one of `areas` is off ("Search and Chat are turned off
 * for this installation.": the root cause, as the area note says it). Still loading stays loading.
 */
export function areaGateFor(gate: ActionGate, areas: Area | readonly Area[], areaOn: (area: Area) => boolean, reasons?: OffReasons): ActionGate {
  if (gate.state === 'loading') return gate;
  const off = ([] as Area[]).concat(areas).find((a) => !areaOn(a));
  return off ? { state: 'locked', reason: offAreasText([off], areaOn, reasons) } : gate;
}

/** `areaGateFor` with the signed-in user's areas. */
export function useAreaGate(gate: ActionGate, areas: Area | readonly Area[]): ActionGate {
  const { areaOn, access } = useAccess();
  return areaGateFor(gate, areas, areaOn, access);
}

/** The widget kinds the widget playground can render, and the area each needs. */
export type WidgetKind = 'chat' | 'search';
export const WIDGET_KIND_AREA: Record<WidgetKind, Area> = { chat: 'chat', search: 'search' };

/** The kind to open on: chat, unless Chat is off. */
/**
 * The choice to show: what the user picked while its area is on, otherwise the default for the
 * areas that are on now. So a page that opened while access was loading, or a pick whose area was
 * switched off since, settles on one that works (the off one stays visible, disabled).
 */
export function settledChoice<T extends string>(
  picked: T | null,
  areaOf: Record<T, Area>,
  areaOn: (area: Area) => boolean,
  fallback: (areaOn: (area: Area) => boolean) => T,
): T {
  return picked !== null && areaOn(areaOf[picked]) ? picked : fallback(areaOn);
}

export function initialWidgetKind(areaOn: (area: Area) => boolean): WidgetKind {
  return areaOn('chat') || !areaOn('search') ? 'chat' : 'search';
}

/** The tabs of the search Test page, and the area each needs. */
export type SearchTab = 'index' | 'experience';
export const SEARCH_TAB_AREA: Record<SearchTab, Area> = { index: 'managed-indexes', experience: 'search' };

/** The tab to open on: Index Search, unless Managed indexes is off and Search is on. */
export function initialSearchTab(areaOn: (area: Area) => boolean): SearchTab {
  return areaOn('managed-indexes') || !areaOn('search') ? 'index' : 'experience';
}
