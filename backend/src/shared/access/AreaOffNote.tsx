// src/shared/access/AreaOffNote.tsx

/**
 * The one note for something a feature switch turned off: says which area is off and, for an
 * Admin, links to Settings → Features. Use it where the hidden or disabled thing would have
 * been, so nobody thinks their setup was lost. `detail` adds what that means here ("Roles keep
 * these permissions, and they apply again when Chat is on.").
 */

'use client';

import { PowerOff } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { useAccess } from './useAccess';

import { AREAS, PINNED_OFF_MESSAGE, TURNED_OFF_MESSAGE, type Area } from '@/features/feature-switches/areas';
import { offCauses, type OffCauses, type OffReasons } from '@/features/feature-switches/off-causes';

export const FEATURES_SETTINGS_HREF = '/settings/features';

/** "Chat", "AI summaries", ... */
export function areaLabel(area: Area): string {
  return AREAS.find((a) => a.id === area)?.label ?? area;
}

/** "Chat is turned off for this installation." */
export function areaOffText(area: Area): string {
  return `${areaLabel(area)} is turned off for this installation.`;
}

/**
 * The same sentence for several areas: "Managed indexes and Playground are turned off for this
 * installation." With none known it falls back to the generic message.
 */
export function areasOffText(areas: readonly Area[]): string {
  if (areas.length === 0) return TURNED_OFF_MESSAGE;
  if (areas.length === 1) return areaOffText(areas[0]);
  return `${labelList(areas)} are turned off for this installation.`;
}

/** "Chat", "Search and Chat", "Playground, Search and Chat" */
function labelList(areas: readonly Area[]): string {
  const labels = areas.map(areaLabel);
  return labels.length < 2 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/**
 * What to tell about off areas once their root causes are known: the switched-off ones in the
 * usual sentence, the ones the deployment setting pins off with its own message (they can't be
 * turned on in Settings → Features).
 */
export function offCausesText({ pinned, switchable }: OffCauses): string {
  const parts: string[] = [];
  if (switchable.length > 0 || pinned.length === 0) parts.push(areasOffText(switchable));
  if (pinned.length > 0) parts.push(`${labelList(pinned)}: ${PINNED_OFF_MESSAGE}`);
  return parts.join(' ');
}

/** The sentence for off areas: names what is really off (see offCauses), not an area that only lacks what it needs. */
export function offAreasText(areas: readonly Area[], areaOn: (area: Area) => boolean, reasons?: OffReasons): string {
  return offCausesText(offCauses(areas, areaOn, reasons));
}

/** "Roles keep these permissions, and they apply again when Chat (or Managed indexes) is on." */
export function rolesKeepDetail(areas: readonly Area[]): string {
  return `Roles keep these permissions, and they apply again when ${areas.map(areaLabel).join(' or ')} is on.`;
}

export function AreaOffNote({ area, areas, detail, className }: { area?: Area; areas?: readonly Area[]; detail?: ReactNode; className?: string }) {
  const { isAdmin, areaOn, access } = useAccess();
  const causes = offCauses(areas ?? (area ? [area] : []), areaOn, access);
  // Nothing to turn on in Settings → Features when the deployment setting pins every cause off
  const canTurnOn = isAdmin && (causes.switchable.length > 0 || causes.pinned.length === 0);
  return (
    <p role="note" className={`flex items-start gap-2 text-sm text-muted-foreground ${className ?? ''}`}>
      <PowerOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        {offCausesText(causes)}
        {detail ? <> {detail}</> : null}
        {canTurnOn ? (
          <>
            {' '}
            <Link href={FEATURES_SETTINGS_HREF} className="underline underline-offset-2 hover:text-foreground">
              Settings → Features
            </Link>
          </>
        ) : null}
      </span>
    </p>
  );
}
