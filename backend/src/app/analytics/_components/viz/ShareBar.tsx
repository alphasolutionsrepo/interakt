// app/analytics/_components/viz/ShareBar.tsx

'use client';

import { formatCompact, formatPercent } from './format';

// ============================================================================
// TYPES
// ============================================================================

export interface ShareItem {
  key: string;
  label: string;
  value: number;
  /** A viz token, e.g. 'var(--viz-1)'. Keep the same colour for the same thing everywhere. */
  color: string;
}

interface ShareBarProps {
  items: ShareItem[];
  /** What one unit is, for the legend and screen readers: "searches", "requests" */
  unit: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Part-to-whole as one 100% bar with a legend that doubles as the table.
 * Easier to compare than a donut, and readable without hovering.
 */
export function ShareBar({ items, unit }: ShareBarProps) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const shown = items.filter((item) => item.value > 0);

  return (
    <div className="space-y-4">
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded"
        role="img"
        aria-label={shown.map((i) => `${i.label} ${formatPercent(i.value / total, 0)}`).join(', ')}
      >
        {shown.map((item) => (
          <div
            key={item.key}
            className="h-full first:rounded-l last:rounded-r"
            style={{ flexGrow: item.value, flexBasis: 0, minWidth: 4, background: item.color }}
            title={`${item.label}: ${formatCompact(item.value)} ${unit} (${formatPercent(item.value / total)})`}
          />
        ))}
      </div>
      <ul className="space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-3">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: item.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.label}</span>
            <span className="tabular-nums text-muted-foreground">{formatCompact(item.value)}</span>
            <span className="w-12 text-right font-medium tabular-nums">
              {total > 0 ? formatPercent(item.value / total, 0) : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
