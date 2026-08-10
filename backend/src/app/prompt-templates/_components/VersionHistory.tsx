'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { ChevronRight, History, RotateCcw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import type { PromptTemplate } from '../_lib/api-client';

// ============================================================================
// VERSION HISTORY
// ============================================================================

export function VersionHistory({
  history,
  currentId,
  onRollback,
  isRollingBack,
}: {
  history: PromptTemplate[];
  currentId: string;
  onRollback: (targetId: string) => void;
  isRollingBack: boolean;
}) {
  if (!history.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <History className="size-4" />
          Version History ({history.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {history.map((v, i) => {
            const isCurrent = v.id === currentId;
            return (
              <div
                key={v.id}
                className={`flex items-center gap-3 py-2 px-3 rounded-lg ${
                  isCurrent ? 'bg-primary/5 border border-primary/20' : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">v{v.version}</span>
                    {v.isSystemDefault && (
                      <Badge className="text-[10px] bg-blue-500/10 text-blue-600 border-0">
                        Default
                      </Badge>
                    )}
                    {isCurrent && (
                      <Badge className="text-[10px] bg-primary/10 text-primary border-0">
                        Viewing
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {v.label ?? 'No description'}
                    {' · '}
                    {format(new Date(v.createdAt), 'MMM d, yyyy HH:mm')}
                  </p>
                </div>
                {!isCurrent && !v.isSystemDefault && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          onClick={() => onRollback(v.id)}
                          disabled={isRollingBack}
                        >
                          <RotateCcw className="size-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Make this the system default</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {!isCurrent && (
                  <Link href={`/prompt-templates/${v.id}`}>
                    <Button variant="ghost" size="icon" className="size-8 shrink-0">
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
