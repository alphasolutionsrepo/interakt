// src/app/playground/_lib/area-gate.ts

/** What the Test pages need beyond the general area gate (shared/access/area-gate.ts): which kind or tab is shown, and the area each needs. */

import { useState } from 'react';

import type { Area } from '@/features/feature-switches/areas';

/** The widget kinds the widget playground can render, and the area each needs. */
export type WidgetKind = 'chat' | 'search';
export const WIDGET_KIND_AREA: Record<WidgetKind, Area> = { chat: 'chat', search: 'search' };

/** A pick that remembers which widget kind it was made for (an experience, a launcher). */
export interface KindPick<V> {
  kind: WidgetKind;
  value: V;
}

/** The pick, only while it belongs to the kind now shown: after the shown kind settles elsewhere it is void. */
export function pickFor<V>(pick: KindPick<V> | null, kind: WidgetKind): V | undefined {
  return pick && pick.kind === kind ? pick.value : undefined;
}

/** The applied preview, unless its kind's area is off (the off kind's widget can't be previewed). */
export function previewIfOn<T extends { kind: WidgetKind }>(applied: T | null, areaOn: (area: Area) => boolean): T | null {
  return applied && areaOn(WIDGET_KIND_AREA[applied.kind]) ? applied : null;
}

/**
 * The applied preview, held as state. Once its kind's area is seen off it is dropped, not just hidden,
 * so switching the area back on never brings an old preview (and its access token) back without Apply.
 * While access loads every area reads off, so nothing is dropped then.
 */
export function useKindPreview<T extends { kind: WidgetKind }>(areaOn: (area: Area) => boolean, accessLoading: boolean) {
  const [stored, setStored] = useState<T | null>(null);
  const shown = previewIfOn(stored, areaOn);
  // Adjusting state during render (React re-renders straight away, before anything is shown)
  if (stored && !shown && !accessLoading) setStored(null);
  return [shown, setStored] as const;
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
