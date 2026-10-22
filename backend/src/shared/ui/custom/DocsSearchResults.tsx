'use client';

// src/shared/ui/custom/DocsSearchResults.tsx
//
// Docs search results for the help drawer's Search mode: group filter chips,
// result rows (page › section, highlighted snippet) and a closing "Ask AI
// about … instead" row that only acts when chosen. The drawer owns the input
// and the keyboard: `selected` indexes the rows, with the Ask row last.

import { ArrowDown, ArrowUp, CornerDownLeft, FileText, Hash, Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';
import type { DocsSearchHit } from '@/shared/help/docs-search';
import type { DocsSearchState } from '@/shared/help/useDocsSearch';

/** The listbox id and row ids the drawer's combobox input points at (aria-controls / aria-activedescendant). */
export const RESULTS_ID = 'help-search-results';
export const resultRowId = (index: number) => `help-search-row-${index}`;

interface DocsSearchResultsProps {
  query: string;
  search: DocsSearchState;
  group: string | null;
  onGroupChange: (group: string | null) => void;
  /** Index of the highlighted row; hits first, then the Ask row (index = hits.length). */
  selected: number;
  onHover: (index: number) => void;
  onOpen: (hit: DocsSearchHit) => void;
  onAsk: (query: string) => void;
}

export function DocsSearchResults({
  query,
  search,
  group,
  onGroupChange,
  selected,
  onHover,
  onOpen,
  onAsk,
}: DocsSearchResultsProps) {
  const q = query.trim();
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the highlighted row in view while moving with the arrow keys.
  useEffect(() => {
    listRef.current?.querySelector(`[data-row="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* No counts on the chips: a natural-language query loosely matches most
          of the docs, so totals say little — the ranking is what matters. */}
      {search.groups.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b border-border/60 px-4 py-2">
          <Chip active={!group} onClick={() => onGroupChange(null)} label="All" />
          {search.groups.map((g) => (
            <Chip key={g} active={group === g} onClick={() => onGroupChange(group === g ? null : g)} label={g} />
          ))}
        </div>
      )}

      <div
        ref={listRef}
        id={RESULTS_ID}
        role="listbox"
        aria-label="Docs search results"
        className="min-h-0 flex-1 overflow-y-auto p-2"
      >
        {search.hits.map((hit, i) => (
          <ResultRow
            key={hit.id}
            index={i}
            hit={hit}
            selected={selected === i}
            onHover={onHover}
            onSelect={() => onOpen(hit)}
          />
        ))}

        {search.status === 'ready' && search.hits.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No docs match &ldquo;{q}&rdquo;{group ? ` in ${group}` : ''}.
          </p>
        )}
        {search.status === 'error' && (
          <p className="px-3 py-6 text-center text-sm text-destructive">Search failed. Try again in a moment.</p>
        )}

        <button
          type="button"
          role="option"
          id={resultRowId(search.hits.length)}
          tabIndex={-1}
          aria-selected={selected === search.hits.length}
          data-row={search.hits.length}
          onMouseMove={() => onHover(search.hits.length)}
          onClick={() => onAsk(q)}
          className={cn(
            'mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm',
            selected === search.hits.length && 'bg-accent',
          )}
        >
          <Sparkles className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">
            Ask AI about <span className="font-medium">&ldquo;{q}&rdquo;</span> instead
          </span>
        </button>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
        <span role="status" className="truncate">
          {search.fallback
            ? 'Matching page titles only — full-text docs search is still being set up.'
            : search.tookMs !== null
              ? `Interakt search · ${search.tookMs} ms`
              : 'Searching…'}
        </span>
        <span className="hidden shrink-0 items-center gap-1 sm:flex">
          <Kbd>
            <ArrowUp className="size-3" />
          </Kbd>
          <Kbd>
            <ArrowDown className="size-3" />
          </Kbd>{' '}
          to move
          <Kbd>
            <CornerDownLeft className="size-3" />
          </Kbd>{' '}
          to open
        </span>
      </footer>
    </div>
  );
}

function ResultRow({
  index,
  hit,
  selected,
  onHover,
  onSelect,
}: {
  index: number;
  hit: DocsSearchHit;
  selected: boolean;
  onHover: (index: number) => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      id={resultRowId(index)}
      // Rows are reached with the arrow keys from the search box, not Tab.
      tabIndex={-1}
      aria-selected={selected}
      data-row={index}
      onMouseMove={() => onHover(index)}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left [&_mark]:rounded-sm [&_mark]:bg-yellow-200/80 [&_mark]:px-0.5 [&_mark]:text-foreground dark:[&_mark]:bg-yellow-400/25',
        selected && 'bg-accent',
      )}
    >
      {hit.section ? (
        <Hash className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      ) : (
        <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block truncate text-sm">
          <span className="font-medium" dangerouslySetInnerHTML={{ __html: hit.titleHtml }} />
          {hit.sectionHtml && (
            <>
              <span className="mx-1.5 text-muted-foreground">›</span>
              <span dangerouslySetInnerHTML={{ __html: hit.sectionHtml }} />
            </>
          )}
        </span>
        {hit.snippetHtml && (
          <span
            className="line-clamp-2 text-xs leading-relaxed text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: hit.snippetHtml }}
          />
        )}
      </span>
      {hit.group && (
        <span className="mt-0.5 shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {hit.group}
        </span>
      )}
    </button>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
        active
          ? 'border-primary/40 bg-primary/10 font-medium text-primary'
          : 'border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border/80 bg-muted px-1 font-sans text-[10px]">
      {children}
    </kbd>
  );
}
