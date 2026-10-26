// app/dashboard/_components/HomeCards.tsx

'use client';

/**
 * Short stories about the data, one per card: a change worth knowing, or a
 * finding from the nightly insights, each with one way in. Tips follow: things
 * this install could do better, dismissible for good.
 */

import { AlertTriangle, CheckCircle2, CircleAlert, Info, Lightbulb, Sparkles, X } from 'lucide-react';
import Link from 'next/link';

import { useDismissTip, type HomeCard, type HomeTip } from '../_lib/useHome';

import { MiniCompareChart } from '@/app/analytics/_components/viz';
import { useAskPanel } from '@/app/analytics/_lib/AskPanelContext';
import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/components/button';
import { Skeleton } from '@/shared/ui/components/skeleton';


const TONE = {
  critical: { icon: CircleAlert, className: 'text-viz-critical', label: 'Needs attention' },
  warning: { icon: AlertTriangle, className: 'text-viz-warning', label: 'Worth a look' },
  info: { icon: Info, className: 'text-viz-1', label: 'Info' },
  good: { icon: CheckCircle2, className: 'text-viz-good', label: 'Good news' },
} as const;

const CARD = 'flex min-h-[220px] flex-col gap-3 rounded-2xl border border-border/60 bg-card p-5 shadow-sm';

function InsightCard({ card }: { card: HomeCard }) {
  const askPanel = useAskPanel();
  const tone = TONE[card.tone];
  const Icon = tone.icon;
  return (
    <article className={CARD}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={cn('size-3.5', tone.className)} aria-label={tone.label} />
        {card.eyebrow}
      </p>
      {card.chart && (
        <MiniCompareChart {...card.chart} label={`${card.title}: the last 7 days against the 7 days before`} />
      )}
      <div className="space-y-1">
        <h3 className="font-medium leading-snug">{card.title}</h3>
        <p className="text-sm text-muted-foreground">{card.body}</p>
      </div>
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <Button variant="outline" size="sm" className="rounded-xl" asChild>
          <Link href={card.href}>{card.linkLabel}</Link>
        </Button>
        {card.ask && (
          <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => askPanel.open(card.ask)}>
            <Sparkles className="mr-1.5 size-3.5" /> Ask
          </Button>
        )}
      </div>
    </article>
  );
}

function TipCard({ tip }: { tip: HomeTip }) {
  const dismiss = useDismissTip();
  return (
    <article className={cn(CARD, 'relative bg-muted/30')}>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 size-8 text-muted-foreground"
        onClick={() => dismiss.mutate(tip.id)}
        aria-label={`Dismiss tip: ${tip.title}`}
        title="Don't show this tip again"
      >
        <X className="size-4" />
      </Button>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lightbulb className="size-3.5 text-viz-warning" aria-hidden /> Tip
      </p>
      <div className="space-y-1 pr-6">
        <h3 className="font-medium leading-snug">{tip.title}</h3>
        <p className="text-sm text-muted-foreground">{tip.body}</p>
      </div>
      <div className="mt-auto pt-1">
        <Button variant="outline" size="sm" className="rounded-xl" asChild>
          <Link href={tip.action.href}>{tip.action.label}</Link>
        </Button>
      </div>
    </article>
  );
}

export function HomeCards({ cards, tips, loading }: { cards?: HomeCard[]; tips?: HomeTip[]; loading: boolean }) {
  if (loading || !cards || !tips) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[220px] rounded-2xl" />
        ))}
      </div>
    );
  }
  if (cards.length === 0 && tips.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
        Nothing new to report this week. Findings appear here as your experiences get used.
      </p>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => (
        <InsightCard key={c.id} card={c} />
      ))}
      {tips.map((t) => (
        <TipCard key={t.id} tip={t} />
      ))}
    </div>
  );
}
