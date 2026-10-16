'use client';

/**
 * Body of an AI summary: paragraphs and bullet lists with bold labels,
 * citation chips linking to the cited result, and a row of cited sources once
 * the summary completes. Shared by every search experience that shows one.
 */

import { parseSummary, citedNumbers, labelCitation, type InlineRun } from '@/lib/summary-format';
import type { SearchResult, DisplayConfig } from '@/lib/api/types';
import { getItemLink, getItemTitle } from '@/app/search-interface/components/DynamicResultCard';

/** A result the summary can cite: [n] refers to the nth result sent */
interface SummarySource {
  title: string;
  href: string;
  isExternal: boolean;
}

function linkProps(src: SummarySource) {
  return src.isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {};
}

/** A citation marker: a numbered chip linking to the cited result. */
function Citation({ n, sources }: { n: number; sources: SummarySource[] }) {
  const src = sources[n - 1];
  if (!src) return null; // the model cited a result it wasn't given: drop it
  return (
    <a
      href={src.href}
      title={src.title}
      {...linkProps(src)}
      className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary/10 px-1 align-[2px] text-[10px] font-semibold leading-none text-primary no-underline transition-colors hover:bg-primary/20"
    >
      {n}
    </a>
  );
}

function Runs({ runs, sources, labelLink }: { runs: InlineRun[]; sources: SummarySource[]; labelLink?: number | null }) {
  // A list item's lead bold label links to the page it cites, like its citation chip
  const labelSource = labelLink ? sources[labelLink - 1] : undefined;
  const labelIndex = labelSource ? runs.findIndex((r) => r.kind === 'bold') : -1;
  return (
    <>
      {runs.map((r, i) =>
        r.kind === 'cite' ? (
          <Citation key={i} n={r.n} sources={sources} />
        ) : r.kind === 'bold' && i === labelIndex && labelSource ? (
          <a
            key={i}
            href={labelSource.href}
            {...linkProps(labelSource)}
            className="font-semibold text-foreground underline decoration-primary/30 underline-offset-2 transition-colors hover:text-primary hover:decoration-primary"
          >
            {r.text}
          </a>
        ) : r.kind === 'bold' ? (
          <strong key={i} className="font-semibold text-foreground">{r.text}</strong>
        ) : (
          <span key={i}>{r.text}</span>
        ),
      )}
    </>
  );
}

interface AISummaryContentProps {
  summary: string;
  isStreaming: boolean;
  isComplete: boolean;
  /** The results the summary was generated from, in the order sent */
  results: SearchResult[];
  displayConfig?: DisplayConfig | null;
  /** Text size and color of the body, e.g. "text-sm text-foreground/80" */
  className?: string;
}

export function AISummaryContent({ summary, isStreaming, isComplete, results, displayConfig, className }: AISummaryContentProps) {
  // Citations number the results sent for summarizing (the first 10), in order
  const sources: SummarySource[] = results.slice(0, 10).map((r) => ({
    title: getItemTitle(r, displayConfig),
    ...getItemLink(r, displayConfig),
  }));
  // The follow-up line streams in before the hook strips it on completion
  const blocks = parseSummary(summary.replace(/\n?\s*FOLLOW_UP:[\s\S]*$/i, ''));
  const cited = citedNumbers(blocks).filter((n) => sources[n - 1]);

  return (
    <>
      <div className={`space-y-3 leading-relaxed ${className ?? ''}`}>
        {blocks.map((block, i) =>
          block.kind === 'paragraph' ? (
            <p key={i}>
              <Runs runs={block.runs} sources={sources} labelLink={labelCitation(block.runs)} />
            </p>
          ) : (
            <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">
              {block.items.map((item, j) => (
                <li key={j}>
                  <Runs runs={item} sources={sources} labelLink={labelCitation(item)} />
                </li>
              ))}
            </ul>
          ),
        )}
        {isStreaming && (
          <span className="inline-block w-0.5 h-4 bg-foreground ml-0.5 animate-pulse align-middle" />
        )}
      </div>
      {/* Cited pages */}
      {isComplete && cited.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="self-center text-xs font-medium text-muted-foreground mr-1">Sources:</span>
          {cited.map((n) => {
            const src = sources[n - 1];
            return (
              <a
                key={n}
                href={src.href}
                {...linkProps(src)}
                className="inline-flex max-w-[280px] items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs text-foreground/80 transition-colors hover:bg-muted"
              >
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/10 px-1 text-[10px] font-semibold text-primary">{n}</span>
                <span className="truncate">{src.title}</span>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}
