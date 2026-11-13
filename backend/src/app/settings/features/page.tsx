// app/settings/features/page.tsx

'use client';

import { RefreshCw, Settings2, ToggleRight } from 'lucide-react';
import { useState } from 'react';

import { FeatureRowItem } from './_components/FeatureRowItem';
import { answerDialog, decideToggle, dialogText, type Asking, type DialogChoice } from './_lib/feature-toggle';
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
import type { Area } from '@/features/feature-switches/areas';
import { areaLabel } from '@/shared/access/AreaOffNote';
import { errorText } from '@/shared/api/api-error';
import { PageHeader } from '@/shared/ui/custom/PageHeader';

export default function FeaturesPage() {
  const { data: areas, isLoading, isError, error, refetch } = useFeatures();
  const update = useUpdateFeatures();
  const [asking, setAsking] = useState<Asking | null>(null);

  const toggle = (id: Area, next: boolean) => {
    const decision = decideToggle(areas ?? [], id, next);
    if ('ask' in decision) setAsking(decision.ask);
    else update.mutate(decision.save);
  };

  const answer = (choice: DialogChoice) => {
    answerDialog(asking, choice, update.mutate);
    setAsking(null);
  };

  const text = asking ? dialogText(asking, areaLabel) : null;

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
            <AlertDialogTitle>{text?.title}</AlertDialogTitle>
            <AlertDialogDescription>{text?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl" onClick={() => answer('only')}>{text?.onlyLabel}</AlertDialogAction>
            <AlertDialogAction className="rounded-xl" onClick={() => answer('both')}>
              Switch both off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
