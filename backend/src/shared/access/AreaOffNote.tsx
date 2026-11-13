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

import { AREAS, type Area } from '@/features/feature-switches/areas';

export const FEATURES_SETTINGS_HREF = '/settings/features';

/** "Chat", "AI summaries", ... */
export function areaLabel(area: Area): string {
  return AREAS.find((a) => a.id === area)?.label ?? area;
}

/** "Chat is turned off for this installation." */
export function areaOffText(area: Area): string {
  return `${areaLabel(area)} is turned off for this installation.`;
}

export function AreaOffNote({ area, detail, className }: { area: Area; detail?: ReactNode; className?: string }) {
  const { isAdmin } = useAccess();
  return (
    <p role="note" className={`flex items-start gap-2 text-sm text-muted-foreground ${className ?? ''}`}>
      <PowerOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        {areaOffText(area)}
        {detail ? <> {detail}</> : null}
        {isAdmin ? (
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
