// app/setup/_components/DemoRemoveCard.tsx

'use client';

import { Check, Loader2, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  provider: string | null;
  busy: null | 'seed' | 'reset';
  onReset: () => void;
}

/**
 * Shown in place of the demo card while Search, Chat or Managed indexes is off and demo data
 * was already set up: setting it up again is not offered, but an Admin can still remove it.
 */
export function DemoRemoveCard({ provider, busy, onReset }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Demo data
          <Badge variant="secondary" className="gap-1 text-emerald-600">
            <Check className="h-3 w-3" /> Demo configured{provider ? ` · ${provider}` : ''}
          </Badge>
        </CardTitle>
        <CardDescription>The sample Fashion Catalog set up earlier is still in place. You can remove it here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="destructive" onClick={onReset} disabled={!!busy}>
          {busy === 'reset' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
          Reset
        </Button>
        {busy === 'reset' && <p className="text-sm text-muted-foreground">Tearing the demo down…</p>}
      </CardContent>
    </Card>
  );
}
