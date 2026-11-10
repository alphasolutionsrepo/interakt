// src/shared/ui/custom/DangerZone.tsx

/**
 * The "Danger Zone" card at the bottom of a detail page: one Delete, locked with the reason for
 * someone who may not delete (shared/access/ActionControls.tsx). The confirmation dialog stays
 * with the page, which knows what deleting removes.
 */

'use client';

import { Trash2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { UiActionId } from '@/features/access/ui-actions';
import { ActionButton } from '@/shared/access/ActionControls';
import { CollapsibleCard } from '@/shared/ui/custom/CollapsibleCard';

interface DangerZoneProps {
  /** What is deleted, as in "Delete this search index" */
  thing: string;
  /** What deleting removes */
  detail: string;
  /** The delete action, so the button follows the server's rule */
  action: UiActionId;
  onDelete: () => void;
  /** Disabled for its own reason, which `detail` explains (still in use) */
  disabled?: boolean;
  /** Folded away until opened (the experience pages) */
  collapsible?: boolean;
}

export function DangerZone({ thing, detail, action, onDelete, disabled = false, collapsible = false }: DangerZoneProps) {
  const description = `Irreversible actions that permanently affect this ${thing}.`;
  const body = (
    <div className="flex items-center justify-between gap-4 p-4 bg-destructive/5 rounded-xl border border-destructive/20">
      <div>
        <p className="font-medium text-sm">Delete this {thing}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
      </div>
      <ActionButton action={action} icon={Trash2} variant="destructive" className="rounded-xl shrink-0" onClick={onDelete} disabled={disabled}>
        Delete
      </ActionButton>
    </div>
  );

  if (collapsible) {
    return (
      <CollapsibleCard
        className="border-destructive/30"
        icon={<Trash2 className="size-4 text-destructive" />}
        title={<span className="text-destructive">Danger Zone</span>}
        description={description}
      >
        {body}
      </CollapsibleCard>
    );
  }
  return (
    <Card className="border-destructive/30 shadow-sm rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 font-semibold text-destructive">
          <Trash2 className="size-4" />
          Danger Zone
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
