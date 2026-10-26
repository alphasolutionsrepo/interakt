// app/analytics/_components/PeriodPicker.tsx

'use client';

/**
 * The period every analytics section shows: preset rows ("Last 7 days", "This
 * month") and a custom range on a calendar. Days follow the viewer's time zone,
 * which the picker names.
 */

import { useState } from 'react';
import { Check, ChevronDown, Clock } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { useAnalyticsContext } from '../_lib/AnalyticsContext';
import { PERIOD_PRESETS, fromLocalDate, isCustom, toLocalDate } from '../_lib/period';

import { Button } from '@/shared/ui/components/button';
import { Calendar } from '@/shared/ui/components/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/components/popover';
import { cn } from '@/lib/utils';

export function PeriodPicker({ compact = false }: { compact?: boolean }) {
  const { period, setPeriod, periodLabel, timeZone } = useAnalyticsContext();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'presets' | 'custom'>('presets');
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);

  const openPicker = (next: boolean) => {
    setOpen(next);
    if (next) {
      setView(isCustom(period) ? 'custom' : 'presets');
      setDraft(isCustom(period) ? { from: fromLocalDate(period.from), to: fromLocalDate(period.to) } : undefined);
    }
  };

  const applyCustom = () => {
    if (!draft?.from) return;
    setPeriod({ from: toLocalDate(draft.from), to: toLocalDate(draft.to ?? draft.from) });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={openPicker}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('justify-between gap-2', compact ? 'h-8 rounded-lg text-xs' : 'h-9 rounded-xl')}
          aria-label={`Period: ${periodLabel}`}
        >
          <Clock className={cn('text-muted-foreground', compact ? 'size-3' : 'size-4')} aria-hidden />
          <span className="truncate">{periodLabel}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        {view === 'presets' ? (
          <div className="w-56 py-1">
            <ul role="listbox" aria-label="Period">
              {PERIOD_PRESETS.map(({ preset, label }) => {
                const selected = !isCustom(period) && period.preset === preset;
                return (
                  <li key={preset} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onClick={() => {
                        setPeriod({ preset });
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    >
                      <Check className={cn('size-4', selected ? 'opacity-100' : 'opacity-0')} strokeWidth={2.5} aria-hidden />
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-1 border-t px-1 pt-1">
              <button
                type="button"
                onClick={() => setView('custom')}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <Check className={cn('size-4', isCustom(period) ? 'opacity-100' : 'opacity-0')} strokeWidth={2.5} aria-hidden />
                Custom range…
              </button>
            </div>
            <p className="border-t px-3 pt-2 pb-1 text-xs text-muted-foreground">Times in {timeZone}</p>
          </div>
        ) : (
          <div className="space-y-2 p-2">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={draft}
              onSelect={setDraft}
              defaultMonth={draft?.from ?? new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)}
              disabled={{ after: new Date() }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-1 pt-2">
              <p className="text-xs text-muted-foreground">
                {draft?.from ? 'Whole days' : 'Pick a start and end day'} · Times in {timeZone}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setView('presets')}>
                  Back
                </Button>
                <Button size="sm" onClick={applyCustom} disabled={!draft?.from}>
                  Apply
                </Button>
              </div>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
