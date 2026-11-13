// src/app/playground/_lib/area-gate.ts

/**
 * Test buttons follow two things: the permission to test (an ActionGate) and the feature area
 * the test needs (Playground, or the area being tested). When an area is off the button stays
 * visible but locked with the same reason the area note gives, like a permission lock.
 */

'use client';

import type { ActionGate } from '@/shared/access/ActionControls';
import { areaOffText } from '@/shared/access/AreaOffNote';
import { useAccess } from '@/shared/access/useAccess';
import type { Area } from '@/features/feature-switches/areas';

/** The gate, or locked with "<Area> is turned off for this installation." when one of `areas` is off. Still loading stays loading. */
export function areaGateFor(gate: ActionGate, areas: Area | readonly Area[], areaOn: (area: Area) => boolean): ActionGate {
  if (gate.state === 'loading') return gate;
  const off = ([] as Area[]).concat(areas).find((a) => !areaOn(a));
  return off ? { state: 'locked', reason: areaOffText(off) } : gate;
}

/** `areaGateFor` with the signed-in user's areas. */
export function useAreaGate(gate: ActionGate, areas: Area | readonly Area[]): ActionGate {
  return areaGateFor(gate, areas, useAccess().areaOn);
}

/** The widget kinds the widget playground can render, and the area each needs. */
export type WidgetKind = 'chat' | 'search';
export const WIDGET_KIND_AREA: Record<WidgetKind, Area> = { chat: 'chat', search: 'search' };

/** The kind to open on: chat, unless Chat is off. */
export function initialWidgetKind(areaOn: (area: Area) => boolean): WidgetKind {
  return areaOn('chat') || !areaOn('search') ? 'chat' : 'search';
}
