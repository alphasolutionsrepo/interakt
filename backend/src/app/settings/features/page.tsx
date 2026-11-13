// app/settings/features/page.tsx

'use client';

import { RefreshCw, Settings2, ToggleRight } from 'lucide-react';
import { useState } from 'react';

import { FeatureRowItem } from './_components/FeatureRowItem';
import { dependentsToAsk, updateBody } from './_lib/feature-rows';
import { useFeatures, useUpdateFeatures } from './_lib/hooks/useFeatureSwitches';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AREAS, type Area } from '@/features/feature-switches/areas';
import { errorText } from '@/shared/api/api-error';
import { PageHeader } from '@/shared/ui/custom/PageHeader';

const labelOf = (id: Area) => AREAS.find((a) => a.id === id)?.label ?? id;

export default function FeaturesPage() {
  const { data: areas, isLoading, isError, error, refetch } = useFeatures();
  const update = useUpdateFeatures();
  const [asking, setAsking] = useState<{ id: Area; dependents: Area[] } | null>(null);

  const toggle = (id: Area, next: boolean) => {
    const dependents = dependentsToAsk(id, next, areas ?? []);
    if (dependents.length > 0) setAsking({ id, dependents });
    else update.mutate(updateBody(id, next));
  };

  const confirm = (alsoOff: Area[]) => {
    if (asking) update.mutate(updateBody(asking.id, false, alsoOff));
    setAsking(null);
  };

  const dependentNames = asking?.dependents.map(labelOf).join(' and ') ?? '';

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      <PageHeader
        variant="settings"
        title="Features"
        description="Turn off the parts of Interakt this installation doesn't use. Your data is kept and comes back when you switch a feature on again."
        icon={ToggleRight}
        iconBg="bg-primary/10"
        iconColor="text-primary"
        breadcrumb={
          <>
            <Settings2 className="size-4" />
            <span className="font-medium">Settings</span>
          </>
        }
      />

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-4 p-8">
          <p className="text-muted-foreground">{errorText(error, 'Could not load the features')}</p>
          <Button onClick={() => refetch()} className="rounded-xl">
            <RefreshCw className="mr-2 size-4" />
            Try Again
          </Button>
        </div>
      )}

      {areas && (
        <div className="divide-y divide-border/60 rounded-2xl border border-border/60">
          {areas.map((area) => (
            <FeatureRowItem key={area.id} area={area} areas={areas} onToggle={toggle} busy={update.isPending} />
          ))}
        </div>
      )}

      <AlertDialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Also switch {dependentNames} off?</AlertDialogTitle>
            <AlertDialogDescription>
              {dependentNames} needs Search. You can switch Search off and leave {dependentNames} as it is; it comes back
              when Search is on again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl" onClick={() => confirm([])}>Search only</AlertDialogAction>
            <AlertDialogAction className="rounded-xl" onClick={() => confirm(asking?.dependents ?? [])}>
              Switch both off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
