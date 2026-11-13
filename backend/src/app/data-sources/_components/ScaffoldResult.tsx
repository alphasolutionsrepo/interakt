// src/app/data-sources/_components/ScaffoldResult.tsx

'use client';

import { Check, ExternalLink, Sparkles, Wrench } from 'lucide-react';

import type { ScaffoldToolsResponse } from '@/app/tools/_lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AccessLink, useCanOpenPage } from '@/shared/access/Can';

/**
 * What "Create tools automatically" made. The links to the tools show only when /tools can be
 * opened (Chat on, tools:view); otherwise the names stay as plain text.
 */
export function ScaffoldResult({ result, onViewAll }: { result: ScaffoldToolsResponse; onViewAll: () => void }) {
  const canOpenPage = useCanOpenPage();
  return (
    <div className="space-y-4">
      {result.created.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="size-3" />
            Created {result.created.length} tool{result.created.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-1.5">
            {result.created.map((t) => (
              <AccessLink key={t.id} href={`/tools/${t.id}`} plain="div"
                className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors group">
                <div className="flex items-center gap-2.5">
                  <Check className="size-4 text-emerald-500" />
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{t.operation}</p>
                  </div>
                </div>
                <ExternalLink className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </AccessLink>
            ))}
          </div>
        </div>
      )}
      {result.skipped.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Skipped ({result.skipped.length})
          </p>
          {result.skipped.map((s, i) => (
            <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/30 text-sm">
              <Badge variant="outline" className="rounded text-[10px] font-mono">{s.operation}</Badge>
              <span className="text-xs text-muted-foreground">{s.reason}</span>
            </div>
          ))}
        </div>
      )}
      {canOpenPage('/tools') && (
        <Button variant="outline" className="rounded-xl" onClick={() => onViewAll()}>
          <Wrench className="size-4 mr-2" />View All Tools
        </Button>
      )}
    </div>
  );
}
