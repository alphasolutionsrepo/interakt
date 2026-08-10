'use client';

import { Layers } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import type { PromptSection } from '../_lib/api-client';

// ============================================================================
// EDITABLE SECTIONS
// ============================================================================

export function SectionsList({ sections }: { sections: PromptSection[] }) {
  if (!sections.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Layers className="size-4" />
          Editable Sections ({sections.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sections.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2">
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200 text-xs">
                {s.id}
              </Badge>
              <span className="text-sm">{s.label}</span>
              {s.editable && (
                <Badge className="text-[10px] bg-green-500/10 text-green-600 border-0 ml-auto">
                  Editable
                </Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
