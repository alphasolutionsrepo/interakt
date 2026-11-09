'use client';

// src/shared/ui/custom/ErrorDetails.tsx
//
// The technical part of an error, collapsed by default: which service failed, its
// status and own words, the error code and the request id support uses to find the
// server log. Copy puts all of it on the clipboard as text. Shared by
// <ProblemAlert> and the Activity panel.

import { Check, ChevronRight, Copy } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export interface ErrorDetailsProps {
  code?: string;
  httpStatus?: number;
  details?: unknown;
  requestId?: string;
  /** The full error as text, for Copy */
  copyText: string;
  className?: string;
}

interface UpstreamDetails {
  provider?: string;
  status?: number;
  code?: string;
  message?: string;
}

function asUpstream(details: unknown): UpstreamDetails | undefined {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return undefined;
  const d = details as Record<string, unknown>;
  return typeof d.provider === 'string' ? (d as UpstreamDetails) : undefined;
}

export function ErrorDetails({ code, httpStatus, details, requestId, copyText, className }: ErrorDetailsProps) {
  const [copied, setCopied] = useState(false);
  const upstream = asUpstream(details);
  const hasMore = !!(code || requestId || details !== undefined);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the text is visible to select by hand
    }
  };

  return (
    <Collapsible className={cn('w-full', className)}>
      <div className="flex items-center gap-1">
        {hasMore && (
          <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
            Details
          </CollapsibleTrigger>
        )}
        <Button type="button" variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs text-muted-foreground" onClick={copy}>
          {copied ? <Check className="mr-1 size-3" /> : <Copy className="mr-1 size-3" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <CollapsibleContent>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-muted/60 p-2 font-mono text-[11px] text-foreground">
          {upstream?.provider && (
            <>
              <dt className="text-muted-foreground">Service</dt>
              <dd>
                {upstream.provider}
                {upstream.status !== undefined && ` · HTTP ${upstream.status}`}
                {upstream.code && ` · ${upstream.code}`}
              </dd>
            </>
          )}
          {upstream?.message && (
            <>
              <dt className="text-muted-foreground">It said</dt>
              <dd className="break-words">{upstream.message}</dd>
            </>
          )}
          {code && (
            <>
              <dt className="text-muted-foreground">Code</dt>
              <dd>
                {code}
                {httpStatus !== undefined && ` (HTTP ${httpStatus})`}
              </dd>
            </>
          )}
          {requestId && (
            <>
              <dt className="text-muted-foreground">Request id</dt>
              <dd className="break-all">{requestId}</dd>
            </>
          )}
          {details !== undefined && !upstream && (
            <>
              <dt className="text-muted-foreground">More</dt>
              <dd>
                <pre className="whitespace-pre-wrap break-words">{JSON.stringify(details, null, 2)}</pre>
              </dd>
            </>
          )}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}
