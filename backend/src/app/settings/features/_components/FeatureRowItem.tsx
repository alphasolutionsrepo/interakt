// app/settings/features/_components/FeatureRowItem.tsx

'use client';

import { rowState, type FeatureRow } from '../_lib/feature-rows';

import type { Area } from '@/features/feature-switches/areas';
import { ActionSwitch, useAdminGate, type ActionGate } from '@/shared/access/ActionControls';

interface Props {
  area: FeatureRow;
  areas: readonly FeatureRow[];
  onToggle: (id: Area, next: boolean) => void;
  busy?: boolean;
}

export function FeatureRowItem({ area, areas, onToggle, busy }: Props) {
  const adminGate = useAdminGate('turn features on or off');
  const { checked, reason } = rowState(area, areas);
  const gate: ActionGate = reason ? { state: 'locked', reason } : adminGate;
  const shownReason = reason ?? (adminGate.state === 'locked' ? adminGate.reason : null);

  return (
    <div className="flex items-start justify-between gap-6 p-5">
      <div className="space-y-1">
        <p className="font-medium">{area.label}</p>
        <p className="text-sm text-muted-foreground">{area.description}</p>
        {shownReason && <p className="text-sm text-muted-foreground">{shownReason}</p>}
      </div>
      <ActionSwitch
        gate={gate}
        checked={checked}
        disabled={busy}
        aria-label={area.label}
        onCheckedChange={(next) => onToggle(area.id, next)}
      />
    </div>
  );
}
