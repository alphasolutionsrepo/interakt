'use client';

/**
 * A tool that can't be added to an AI experience yet (`notReadyReason` from the tools API): the
 * reason with a link to fix it, for the experience tool pickers, and a badge for the Tools list.
 */

import { CircleAlert } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';

export function ToolNotReadyNote({ toolId, reason }: { toolId: string; reason: string }) {
  return (
    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
      {reason}.{' '}
      <Link href={`/tools/${toolId}/edit`} className="underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
        Set it up
      </Link>
    </p>
  );
}

export function NeedsSetupBadge({ reason }: { reason: string }) {
  return (
    <Badge variant="outline" title={reason} className="rounded-lg px-2.5 py-1 text-xs font-semibold border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
      <CircleAlert className="mr-1.5 size-3.5" /> Needs setup
    </Badge>
  );
}
