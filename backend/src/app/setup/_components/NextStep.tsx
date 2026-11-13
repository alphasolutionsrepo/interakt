// src/app/setup/_components/NextStep.tsx

'use client';

import { ArrowRight, type LucideIcon } from 'lucide-react';

import { AccessLink } from '@/shared/access/Can';

/** A "what's next" link: not offered when the page is closed to the role or its feature area is off */
export function NextStep({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  desc: string;
}) {
  // A next step the role can't open isn't offered
  return (
    <AccessLink
      href={href}
      className="group flex items-start gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-accent"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-sm font-medium">
          {title}
          <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </AccessLink>
  );
}
