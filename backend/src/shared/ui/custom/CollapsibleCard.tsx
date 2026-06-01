'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface CollapsibleCardProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** Rendered on the right side of the header, next to the chevron. Visible in both states. */
  headerExtras?: ReactNode;
  /** Starts open when true. Default false. */
  defaultOpen?: boolean;
  children: ReactNode;
  /** Override the outer Card class (e.g., for danger variant). */
  className?: string;
}

/**
 * Generic collapsible card. The whole header row is clickable, with a
 * chevron indicating state. `headerExtras` stays interactive and doesn't
 * trigger the collapse — useful for action buttons (Copy, Save) that
 * should work without expanding first.
 */
export function CollapsibleCard({
  title,
  description,
  icon,
  headerExtras,
  defaultOpen = false,
  children,
  className,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className={`border-border/60 shadow-sm rounded-2xl overflow-hidden ${className ?? ''}`}>
      <CardHeader
        className={`pb-3 cursor-pointer select-none transition-colors hover:bg-muted/30 ${
          open ? '' : 'pb-3'
        }`}
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        aria-expanded={open}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            {icon && <div className="shrink-0 mt-0.5">{icon}</div>}
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold leading-tight">{title}</div>
              {description && (
                <div className="text-sm text-muted-foreground mt-1">{description}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
            {headerExtras}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((v) => !v);
              }}
              className="size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center transition-colors"
              aria-label={open ? 'Collapse' : 'Expand'}
            >
              {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
          </div>
        </div>
      </CardHeader>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}
