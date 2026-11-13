// app/analytics/_components/shell/HiddenSectionsNote.tsx

'use client';

/**
 * One line per feature area that is off and hides analytics sections (Search, Conversations,
 * AI & cost, Traces), so nobody thinks that data is gone.
 */

import { hiddenSectionAreas } from '../../_lib/sections';

import { AreaOffNote } from '@/shared/access/AreaOffNote';
import { useAccess } from '@/shared/access/useAccess';

export function HiddenSectionsNote() {
  const { areaOn, isLoading } = useAccess();
  // While access loads every area reads as off: say nothing until it is known
  if (isLoading) return null;
  const areas = hiddenSectionAreas(areaOn);
  if (areas.length === 0) return null;
  return (
    <div className="space-y-1">
      {areas.map((area) => (
        <AreaOffNote key={area} area={area} detail="Its analytics sections are hidden; the data is kept." />
      ))}
    </div>
  );
}
