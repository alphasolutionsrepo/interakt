// src/app/search-experiences/_components/SummaryAreaGuard.tsx

/**
 * Wraps a search experience's AI settings. With AI summaries on it renders them as they are; with it
 * off the settings stay visible but disabled, under the note, and saved values are untouched.
 */

'use client';

import type { ReactNode } from 'react';

import { AreaOffNote } from '@/shared/access/AreaOffNote';
import { useAccess } from '@/shared/access/useAccess';

export function SummaryAreaGuard({ children }: { children: ReactNode }) {
  const { areaOn, isLoading } = useAccess();
  // Not "off" while the lookup is still answering, so the settings don't flash disabled
  if (isLoading || areaOn('ai-summaries')) return <>{children}</>;
  return (
    <div className="space-y-6">
      <AreaOffNote area="ai-summaries" detail="The experience keeps its summary settings, and they apply again when AI summaries is on." />
      <fieldset disabled className="min-w-0 space-y-6 opacity-60">{children}</fieldset>
    </div>
  );
}
