'use client';

// src/app/docs/_components/DocsSearchButton.tsx
//
// Search box lookalike for the /docs pages; opens the help drawer in Search
// mode (the same drawer as the ? in the header and Ctrl/⌘+K). On /docs, a
// result navigates the page.

import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { openHelp } from '@/shared/help/help-events';

export function DocsSearchButton({ className }: { className?: string }) {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => setIsMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);

  return (
    <button
      type="button"
      onClick={() => openHelp({ mode: 'search' })}
      className={cn(
        'flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      <Search className="size-4" />
      <span className="flex-1 text-left">Search docs…</span>
      <kbd className="rounded border border-border/80 bg-background px-1.5 font-sans text-[10px] font-medium">
        {isMac ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  );
}
