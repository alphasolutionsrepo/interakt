// app/analytics/_components/viz/MiniCompareChart.tsx

'use client';

/**
 * A small chart for a card: this period as a solid line, the period before as
 * a dashed one on the same scale, so the change the card describes is visible
 * at a glance. Plain SVG, so a page of cards stays light.
 */
export function MiniCompareChart({
  current,
  previous,
  fromLabel,
  toLabel,
  label,
  height = 72,
}: {
  current: number[];
  previous?: number[];
  fromLabel: string;
  toLabel: string;
  /** What the chart shows, for screen readers */
  label: string;
  height?: number;
}) {
  const width = 240;
  const pad = 4;
  const max = Math.max(1, ...current, ...(previous ?? []));
  const x = (i: number, n: number) => pad + (n > 1 ? (i / (n - 1)) * (width - pad * 2) : 0);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const path = (values: number[]) => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i, values.length).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = current.length - 1;

  return (
    <figure className="space-y-1">
      <div className="flex justify-between text-[11px] text-muted-foreground" aria-hidden>
        <span>{fromLabel}</span>
        <span>{toLabel}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[72px] w-full" preserveAspectRatio="none" role="img" aria-label={label}>
        <line x1={0} x2={width} y1={height - pad} y2={height - pad} stroke="var(--viz-grid)" strokeWidth={1} />
        {previous && (
          <path d={path(previous)} fill="none" stroke="var(--viz-axis)" strokeWidth={1.5} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        )}
        <path d={path(current)} fill="none" stroke="var(--viz-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="flex gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 rounded-full bg-viz-1" aria-hidden /> Last 7 days
        </span>
        {previous && (
          <span className="flex items-center gap-1">
            <span className="w-3 border-t border-dashed border-[var(--viz-axis)]" aria-hidden /> 7 days before
          </span>
        )}
        <span className="sr-only">Latest day: {current[last]}</span>
      </figcaption>
    </figure>
  );
}
