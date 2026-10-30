// app/analytics/_components/viz/RankedList.tsx

'use client';

import type { ReactNode } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface RankedRow {
  key: string;
  label: string;
  value: number;
  /** The value as shown, e.g. "1.2K" */
  valueLabel: string;
  /** Extra columns shown before the value, e.g. "12% no results" */
  details?: ReactNode;
  /** A control at the end of the row, e.g. "Ask about this" */
  action?: ReactNode;
}

interface RankedListProps {
  rows: RankedRow[];
  /** Bar colour, a viz token. One series, so one colour for every row. */
  color?: string;
  /** Column header for the value, also read with each row */
  valueHeader: string;
  detailsHeader?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

/** A list ranked by value, with a thin bar under each label scaled to the top row. */
export function RankedList({ rows, color = 'var(--viz-1)', valueHeader, detailsHeader }: RankedListProps) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const hasActions = rows.some((r) => r.action);

  return (
    <table className="w-full text-sm">
      <thead className="sr-only">
        <tr>
          <th scope="col">Rank</th>
          <th scope="col">Item</th>
          {detailsHeader && <th scope="col">{detailsHeader}</th>}
          <th scope="col">{valueHeader}</th>
          {hasActions && <th scope="col">Actions</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.key} className="align-top">
            <td className="w-6 py-2 pr-2 text-xs tabular-nums text-muted-foreground">{index + 1}</td>
            {/* w-full + max-w-0 lets this cell take the free width and truncate long labels */}
            <td className="w-full max-w-0 py-2 pr-3">
              <p className="truncate font-medium" title={row.label}>{row.label}</p>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-viz-grid" aria-hidden>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max((row.value / max) * 100, 2)}%`, background: color }}
                />
              </div>
            </td>
            {detailsHeader && (
              <td className="whitespace-nowrap py-2 pr-3 text-right text-xs text-muted-foreground">{row.details}</td>
            )}
            <td className="w-14 whitespace-nowrap py-2 text-right font-semibold tabular-nums">{row.valueLabel}</td>
            {hasActions && <td className="w-10 py-0.5 pl-1 text-right">{row.action}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
