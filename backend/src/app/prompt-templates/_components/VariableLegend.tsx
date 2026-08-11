'use client';

import { Variable } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { SOURCE_COLORS } from '../_lib/template-display';

import type { PromptVariable } from '../_lib/api-client';

// ============================================================================
// VARIABLE LEGEND
// ============================================================================

export function VariableLegend({ variables }: { variables: PromptVariable[] }) {
  if (!variables.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Variable className="size-4" />
          Variables ({variables.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {variables.map((v) => (
            <div key={v.name} className="flex items-start gap-3">
              <code className="text-xs font-mono bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                {`{{${v.name}}}`}
              </code>
              <div className="min-w-0">
                <p className="text-sm">{v.description}</p>
                <Badge variant="outline" className={`text-[10px] mt-1 ${SOURCE_COLORS[v.source] ?? ''}`}>
                  {v.source.replace(/_/g, ' ')}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
