// app/settings/features/_components/FeatureRowItem.tsx

'use client';

import { rowState, type FeatureRow } from '../_lib/feature-rows';

import type { Area } from '@/features/feature-switches/areas';
import { ActionSwitch, useAdminGate, type ActionGate } from '@/shared/access/ActionControls';
import { AccessLink } from '@/shared/access/Can';

interface Props {
  area: FeatureRow;
  areas: readonly FeatureRow[];
  onToggle: (id: Area, next: boolean) => void;
  busy?: boolean;
}

export function FeatureRowItem({ area, areas, onToggle, busy }: Props) {
  const adminGate = useAdminGate('turn features on or off');
  const { checked, locked, reason, needs } = rowState(area, areas);
  const gate: ActionGate = locked && reason ? { state: 'locked', reason } : adminGate;
  const shownReason = locked ? reason : adminGate.state === 'locked' ? adminGate.reason : null;

  return (
    <div className="flex items-start justify-between gap-6 p-5">
      <div className="space-y-1">
        <p className="font-medium">{area.label}</p>
        <p className="text-sm text-muted-foreground">{area.description}</p>
        {shownReason && <p className="text-sm text-muted-foreground">{shownReason}</p>}
        {needs && <p className="text-sm text-muted-foreground">{needs}</p>}
        {/* The menu hides Analytics while it is off, but its settings page stays open */}
        {area.id === 'analytics' && !area.on && (
          <AccessLink href="/analytics/settings" className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
            Analytics settings (collection and retention) stay available
          </AccessLink>
        )}
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
