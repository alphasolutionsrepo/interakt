// src/app/search-experiences/_components/SummaryAreaGuard.tsx

/**
 * Wraps a search experience's AI settings. With AI summaries on it renders them as they are; with it
 * off the settings stay visible but disabled, under the note, and saved values are untouched. Collapsed parts stay
 * open, read-only, so saved text can be read.
 */

'use client';

import type { ReactNode } from 'react';

import { AreaOffNote } from '@/shared/access/AreaOffNote';
import { useAccess } from '@/shared/access/useAccess';

/**
 * Whether AI summaries is off (not while the lookup is still answering). Collapsed sections of
 * the settings use it to stay open: the disabled fieldset also disables their toggle, and saved
 * text must stay readable.
 */
export function useSummaryAreaOff(): boolean {
  const { areaOn, isLoading } = useAccess();
  return !isLoading && !areaOn('ai-summaries');
}

export function SummaryAreaGuard({ children }: { children: ReactNode }) {
  // Not "off" while the lookup is still answering, so the settings don't flash disabled
  if (!useSummaryAreaOff()) return <>{children}</>;
  return (
    <div className="space-y-6">
      <AreaOffNote area="ai-summaries" detail="The experience keeps its summary settings, and they apply again when AI summaries is on." />
      <fieldset disabled className="min-w-0 space-y-6 opacity-60">{children}</fieldset>
    </div>
  );
}
