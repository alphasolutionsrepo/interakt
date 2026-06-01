import { render } from 'preact';
import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import DOMPurify from 'dompurify';

import type {
  DisplayConfig,
  DisplayField,
  DisplayFieldRole,
  Facet,
  SearchConfig,
  SearchResponse,
  SearchResultHit,
} from '../shared/types';
import { createShadowHost } from '../shared/shadow-host';
import { resolveTheme } from '../shared/theme';
import {
  resolveApiBase,
  performSearch,
  performAutocomplete,
  streamSummarize,
  ApiError,
} from '../shared/api-client';
import widgetCss from '../styles/widget.css?raw';

interface InitializedWidget {
  destroy: () => void;
}

const instances = new Map<string, InitializedWidget>();

export const SearchDropinUI = {
  init(config: SearchConfig): void {
    if (!config?.containerId) throw new Error('[Interakt] containerId is required');
    if (!config?.accessToken) throw new Error('[Interakt] accessToken is required');

    instances.get(config.containerId)?.destroy();

    const host = createShadowHost(config.containerId, widgetCss);
    const apiBaseUrl = resolveApiBase(config.apiBaseUrl);

    // Search experiences don't have a per-experience embedConfig endpoint
    // (widget-config is AI-experience-scoped). Theme comes entirely from
    // caller props; apply once at mount.
    const theme = resolveTheme(config.theme, {
      primaryColor: config.primaryColor,
      backgroundColor: config.backgroundColor,
      surfaceColor: config.surfaceColor,
      borderRadius: config.borderRadius,
      fontFamily: config.fontFamily,
    });
    host.applyCssVars(theme.cssVars);

    render(<SearchApp config={config} apiBaseUrl={apiBaseUrl} />, host.mount);

    const instance: InitializedWidget = {
      destroy() {
        render(null, host.mount);
        host.destroy();
        instances.delete(config.containerId);
      },
    };
    instances.set(config.containerId, instance);
  },

  destroy(containerId?: string): void {
    if (containerId) {
      instances.get(containerId)?.destroy();
      return;
    }
    instances.forEach((inst) => inst.destroy());
    instances.clear();
  },
};

interface SearchAppProps {
  config: SearchConfig;
  apiBaseUrl: string;
}

function SearchApp({ config, apiBaseUrl }: SearchAppProps) {
  const isInline = config.mode === 'inline';
  const open = useSignal<boolean>(isInline);
  const query = useSignal('');
  const loading = useSignal(false);
  const results = useSignal<SearchResultHit[]>([]);
  const total = useSignal<number>(0);
  const suggestions = useSignal<string[]>([]);
  const errorMsg = useSignal<string | null>(null);
  /** The search experience's admin-configured display config, returned with each search response. */
  const displayConfig = useSignal<DisplayConfig | null>(null);
  /** All facets returned by the search — only the first `terms` facet is rendered as category chips. */
  const facets = useSignal<Facet[]>([]);
  /**
   * Active category chip: one selected value from the primary terms facet,
   * e.g. `{ field: 'contentType', value: 'article' }`. Single-select only
   * — richer faceted browsing lives in the (future) full-page search. */
  const activeChip = useSignal<{ field: string; value: string } | null>(null);
  /** Index of the currently-highlighted result for keyboard navigation. -1 = none. */
  const selected = useSignal<number>(-1);
  /** AI-generated summary text streamed from /api/v1/summarize for the current query. */
  const summary = useSignal<string>('');
  const summaryStreaming = useSignal<boolean>(false);
  /** Set to false after a 403/404 so we stop attempting summaries for this session. */
  const summaryEnabled = useRef<boolean>(true);

  const debounceRef = useRef<number | null>(null);
  const lastQueryRef = useRef<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLUListElement>(null);
  const summaryAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, []);

  // ⌘K / Ctrl+K opens the modal search from anywhere on the host page.
  // Only active in modal mode — inline mode is always visible.
  useEffect(() => {
    if (isInline) return;
    const onKey = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isCmdK) {
        e.preventDefault();
        if (!open.value) {
          open.value = true;
          config.onEvent?.({ type: 'search:open' });
        }
      } else if (e.key === 'Escape' && open.value) {
        open.value = false;
        config.onEvent?.({ type: 'search:close' });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = async (q: string, chipOverride?: { field: string; value: string } | null) => {
    // Any in-flight summary belongs to the previous query — cancel it.
    summaryAbortRef.current?.abort();
    summaryAbortRef.current = null;
    summary.value = '';
    summaryStreaming.value = false;

    if (!q.trim()) {
      results.value = [];
      suggestions.value = [];
      total.value = 0;
      errorMsg.value = null;
      selected.value = -1;
      facets.value = [];
      activeChip.value = null;
      return;
    }
    lastQueryRef.current = q;
    loading.value = true;
    errorMsg.value = null;
    // Fire as soon as the query is submitted — hosts tracking "searches
    // issued" want this before the response lands. Distinct from
    // search:results which fires after.
    config.onEvent?.({ type: 'search:query', payload: { query: q } });

    // `chipOverride === undefined` means "use the current activeChip";
    // `chipOverride === null` means "clear the chip for this search".
    const chip = chipOverride === undefined ? activeChip.value : chipOverride;
    const searchParams: Parameters<typeof performSearch>[2] & {
      filters?: Array<{ field: string; operator: string; value: unknown }>;
    } = { query: q, page: 1 };
    if (chip) {
      searchParams.filters = [{ field: chip.field, operator: 'eq', value: chip.value }];
    }

    try {
      const [searchResult, suggestionsList] = await Promise.all([
        performSearch(apiBaseUrl, config.accessToken, searchParams) as Promise<SearchResponse>,
        performAutocomplete(apiBaseUrl, config.accessToken, q).catch(() => []),
      ]);

      if (lastQueryRef.current !== q) return; // stale
      results.value = searchResult.results ?? [];
      total.value = searchResult.total?.value ?? results.value.length;
      displayConfig.value = searchResult.displayConfig ?? null;
      // Preserve facet buckets across chip toggles so the chip row doesn't
      // collapse to the single selected value. Only replace when the server
      // returns a full facet set (no active chip).
      if (!chip && searchResult.facets) {
        facets.value = searchResult.facets;
      } else if (!facets.value.length && searchResult.facets) {
        facets.value = searchResult.facets;
      }
      suggestions.value = suggestionsList;
      // Auto-select the first result so Enter always does something.
      selected.value = results.value.length > 0 ? 0 : -1;
      config.onEvent?.({
        type: 'search:results',
        payload: { query: q, count: results.value.length },
      });
      if (results.value.length === 0) {
        config.onEvent?.({ type: 'search:no_results', payload: { query: q } });
      }

      // Kick off the AI summary in parallel. Opt-out via `aiSummary: false`
      // on the caller's init. A 403 also flips summaryEnabled off for the
      // rest of the session so we don't hammer a disabled endpoint.
      const aiSummaryEnabled = config.aiSummary !== false;
      if (aiSummaryEnabled && summaryEnabled.current && results.value.length >= 3) {
        void runSummary(q, results.value);
      }
    } catch (err) {
      errorMsg.value =
        err instanceof ApiError ? err.message : 'Search failed. Please try again.';
      results.value = [];
      total.value = 0;
      selected.value = -1;
    } finally {
      loading.value = false;
    }
  };

  const runSummary = async (q: string, hits: SearchResultHit[]) => {
    const ac = new AbortController();
    summaryAbortRef.current = ac;
    summary.value = '';
    summaryStreaming.value = true;

    try {
      const payload = {
        query: q,
        totalResults: hits.length,
        results: hits.slice(0, 10).map((h) => ({
          id: h.id,
          index: { id: 'default', name: 'default' },
          fields: h.source ?? {},
        })),
      };
      for await (const token of streamSummarize(
        apiBaseUrl,
        config.accessToken,
        payload,
        ac.signal,
      )) {
        // Bail if the query has moved on.
        if (lastQueryRef.current !== q) return;
        summary.value += token;
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
        // Summarize not enabled for this experience — stop trying.
        summaryEnabled.current = false;
      }
      // Silent otherwise; summary is a progressive enhancement.
    } finally {
      if (summaryAbortRef.current === ac) summaryStreaming.value = false;
    }
  };

  const onInput = (raw: string) => {
    query.value = raw;
    // New queries reset the chip so the full facet set gets reloaded.
    activeChip.value = null;
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => runSearch(raw, null), 200);
  };

  /**
   * Toggle a category chip. If the same chip is clicked again, clear it and
   * refetch the unfiltered result set. Otherwise apply the chip and refetch.
   */
  const toggleChip = (field: string, value: string) => {
    const current = activeChip.value;
    const sameChip = current?.field === field && current?.value === value;
    const next = sameChip ? null : { field, value };
    activeChip.value = next;
    config.onEvent?.({
      type: 'search:facet_toggled',
      payload: { field, value, selected: !sameChip },
    });
    runSearch(query.value, next);
  };

  const openResult = (hit: SearchResultHit) => {
    const rendered = renderResultFields(hit, displayConfig.value);
    const url = rendered.url;
    config.onEvent?.({
      type: 'search:result_clicked',
      payload: { id: hit.id, url },
    });
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const close = () => {
    open.value = false;
    config.onEvent?.({ type: 'search:close' });
  };

  const onInputKeyDown = (e: KeyboardEvent) => {
    const r = results.value;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (r.length === 0) return;
      selected.value = Math.min(selected.value + 1, r.length - 1);
      scrollSelectedIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (r.length === 0) return;
      selected.value = Math.max(selected.value - 1, 0);
      scrollSelectedIntoView();
    } else if (e.key === 'Enter') {
      const idx = selected.value;
      if (idx >= 0 && idx < r.length) {
        e.preventDefault();
        openResult(r[idx]);
      }
    }
    // Esc is handled globally in the keydown listener above so the shortcut
    // works whether or not the input has focus.
  };

  const scrollSelectedIntoView = () => {
    const list = resultsRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLLIElement>('.ik-result--selected');
    if (el) el.scrollIntoView({ block: 'nearest' });
  };

  if (!isInline && !open.value) {
    return (
      <button
        class="ik-launcher ik-launcher--search"
        aria-label="Open search"
        onClick={() => {
          open.value = true;
          config.onEvent?.({ type: 'search:open' });
        }}
      >
        <SearchIcon />
      </button>
    );
  }

  return (
    <div class={isInline ? 'ik-search ik-search--inline' : 'ik-search ik-search--modal'}>
      {!isInline && <div class="ik-backdrop" onClick={close} />}
      <div class="ik-search-panel">
        <div class="ik-search-row">
          <SearchIcon />
          <input
            ref={inputRef}
            class="ik-search-input"
            type="search"
            placeholder="Search…"
            value={query.value}
            onInput={(e) => onInput((e.currentTarget as HTMLInputElement).value)}
            onKeyDown={onInputKeyDown}
            autoFocus
            aria-autocomplete="list"
            aria-activedescendant={
              selected.value >= 0 ? `ik-result-${selected.value}` : undefined
            }
          />
          {!isInline && <Kbd label="Esc" />}
          {!isInline && (
            <button class="ik-icon-btn" aria-label="Close search" onClick={close}>
              <CloseIcon />
            </button>
          )}
        </div>

        {loading.value && <div class="ik-status">Searching…</div>}
        {errorMsg.value && <div class="ik-status ik-status--error">{errorMsg.value}</div>}

        {/*
          Autocomplete suggestions are a pre-results affordance — they help
          the user form or correct the query. Once results land, they're
          noise and push the actual results below the fold. Render only
          while results are empty.
        */}
        {!loading.value && suggestions.value.length > 0 && results.value.length === 0 && (
          <div class="ik-suggestions">
            {suggestions.value.slice(0, 5).map((s) => (
              <button key={s} class="ik-chip" onClick={() => onInput(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        {config.facets !== false && (
          <CategoryChips
            facets={facets.value}
            activeChip={activeChip.value}
            onToggle={toggleChip}
          />
        )}

        {(summary.value || summaryStreaming.value) && (
          <AiSummary text={summary.value} streaming={summaryStreaming.value} />
        )}

        <ResultsList
          listRef={resultsRef}
          results={results.value}
          displayConfig={displayConfig.value}
          query={query.value}
          selectedIndex={selected.value}
          onHover={(idx) => (selected.value = idx)}
          onClick={(hit) => openResult(hit)}
        />

        {total.value > 0 && (
          <div class="ik-search-footer">
            <span>
              {results.value.length < total.value
                ? `Showing ${results.value.length} of ${total.value} ${total.value === 1 ? 'result' : 'results'}`
                : `${total.value} ${total.value === 1 ? 'result' : 'results'}`}
            </span>
            <span class="ik-footer-right">
              <span class="ik-kbd-hints">
                <Kbd label="↑" />
                <Kbd label="↓" />
                to navigate
                <Kbd label="↵" />
                to open
              </span>
              {config.seeAllUrl && results.value.length < total.value && (
                <a
                  class="ik-see-all"
                  href={config.seeAllUrl.replace(':q', encodeURIComponent(query.value))}
                  onClick={() => {
                    config.onEvent?.({
                      type: 'search:see_all',
                      payload: { query: query.value, total: total.value },
                    });
                  }}
                >
                  See all results →
                </a>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────

interface ResultsListProps {
  results: SearchResultHit[];
  displayConfig: DisplayConfig | null;
  query: string;
  selectedIndex: number;
  onHover: (index: number) => void;
  onClick: (hit: SearchResultHit) => void;
  listRef: { current: HTMLUListElement | null };
}

function ResultsList({
  results,
  displayConfig,
  query,
  selectedIndex,
  onHover,
  onClick,
  listRef,
}: ResultsListProps) {
  if (!query.trim()) return null;
  if (results.length === 0) return <div class="ik-status">No results</div>;

  return (
    <ul
      class="ik-results"
      role="listbox"
      ref={(el) => {
        listRef.current = el;
      }}
    >
      {results.map((hit, i) => (
        <ResultItem
          key={hit.id}
          hit={hit}
          displayConfig={displayConfig}
          index={i}
          selected={i === selectedIndex}
          onHover={onHover}
          onClick={onClick}
        />
      ))}
    </ul>
  );
}

interface ResultItemProps {
  hit: SearchResultHit;
  displayConfig: DisplayConfig | null;
  index: number;
  selected: boolean;
  onHover: (index: number) => void;
  onClick: (hit: SearchResultHit) => void;
}

function ResultItem({
  hit,
  displayConfig,
  index,
  selected,
  onHover,
  onClick,
}: ResultItemProps) {
  const rendered = renderResultFields(hit, displayConfig);
  const klass = `ik-result${selected ? ' ik-result--selected' : ''}`;

  return (
    <li
      id={`ik-result-${index}`}
      class={klass}
      role="option"
      aria-selected={selected}
      onMouseEnter={() => onHover(index)}
    >
      <button type="button" class="ik-result-link" onClick={() => onClick(hit)}>
        {rendered.image && (
          <img
            class="ik-result-image"
            src={rendered.image}
            alt=""
            loading="lazy"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
          />
        )}
        <div class="ik-result-body">
          <div class="ik-result-title-row">
            <div
              class="ik-result-title"
              dangerouslySetInnerHTML={{ __html: sanitizeHighlighted(rendered.titleHtml) }}
            />
            {rendered.price && <span class="ik-result-price">{rendered.price}</span>}
          </div>
          {(rendered.badge || rendered.rating != null) && (
            <div class="ik-result-meta">
              {rendered.badge && <span class="ik-result-badge">{rendered.badge}</span>}
              {rendered.rating != null && <ResultStars value={rendered.rating} />}
            </div>
          )}
          {rendered.snippetHtml && (
            <div
              class="ik-result-snippet"
              dangerouslySetInnerHTML={{ __html: sanitizeHighlighted(rendered.snippetHtml) }}
            />
          )}
        </div>
        {rendered.url && <ExternalIcon />}
      </button>
    </li>
  );
}

/** Small inline star rating, reused from the chat preset renderer approach. */
function ResultStars({ value }: { value: number }) {
  const stars = Math.min(Math.max(0, value), 5);
  const full = Math.floor(stars);
  const hasHalf = stars - full >= 0.3;
  return (
    <span class="ik-result-rating" aria-label={`${stars.toFixed(1)} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => {
        const state = i < full ? 'full' : i === full && hasHalf ? 'half' : 'empty';
        return (
          <svg key={i} viewBox="0 0 20 20" width="10" height="10" class={`ik-star ik-star--${state}`}>
            <path
              d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9 4.8 17.6l1-5.8L1.5 7.7l5.9-.9z"
              fill={state === 'empty' ? 'none' : 'currentColor'}
              stroke="currentColor"
              stroke-width="1"
              stroke-linejoin="round"
            />
          </svg>
        );
      })}
      <span class="ik-result-rating-num">{stars.toFixed(1)}</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Field resolution — displayConfig-aware, with dot-path support and
// heuristic fallback. Mirrors how the demo-site's DynamicResultCard picks
// fields so admin-configured experiences render consistently everywhere.
// ─────────────────────────────────────────────────────────────────────────────

interface RenderedResult {
  titleHtml: string;
  snippetHtml: string | null;
  image: string | undefined;
  url: string | undefined;
  /** Formatted price string (e.g., "$149.99"), only present if the experience has a price role AND the hit has a value. */
  price: string | undefined;
  /** Numeric rating 0–5, only present if the experience has a rating role AND the hit has a value. */
  rating: number | undefined;
  /** Short badge text (e.g., "CLEARANCE", "NEW"), only present if configured + populated. */
  badge: string | undefined;
}

/** Fallback heuristics used when the experience doesn't ship a displayConfig. */
const FALLBACK_FIELDS: Record<DisplayFieldRole, string[]> = {
  title: ['title', 'name', 'heading', 'label'],
  subtitle: ['subtitle', 'subheading'],
  description: ['description', 'summary', 'body', 'content'],
  image: ['image', 'thumbnail', 'imageUrl', 'photo', 'picture'],
  price: ['price'],
  rating: ['rating'],
  badge: ['badge'],
  secondary: [],
  link: ['url', 'link', 'href'],
};

export function renderResultFields(
  hit: SearchResultHit,
  displayConfig: DisplayConfig | null,
): RenderedResult {
  const source = hit.source ?? {};
  const highlights = hit.highlights ?? {};

  const titleField = resolveField(displayConfig, 'title');
  const descField = resolveField(displayConfig, 'description');
  const imageField = resolveField(displayConfig, 'image');
  const linkField = resolveField(displayConfig, 'link');
  // Price / rating / badge are admin-configured only. No heuristic fallback
  // — we don't want to "discover" a numeric field and mis-render it as a
  // price on a docs site.
  const priceField = resolveField(displayConfig, 'price');
  const ratingField = resolveField(displayConfig, 'rating');
  const badgeField = resolveField(displayConfig, 'badge');

  const titleName = titleField ?? pickFirstPresent(source, FALLBACK_FIELDS.title);
  const descName = descField ?? pickFirstPresent(source, FALLBACK_FIELDS.description);
  const imageName = imageField ?? pickFirstPresent(source, FALLBACK_FIELDS.image);
  const linkName = linkField ?? pickFirstPresent(source, FALLBACK_FIELDS.link);

  const rawTitle = titleName ? stringify(getFieldValue(source, titleName)) : undefined;
  const titleText = rawTitle && rawTitle.length > 0 ? rawTitle : hit.id;
  const titleHtml = titleName
    ? (pickHighlight(highlights, titleName) ?? escapeHtml(titleText))
    : escapeHtml(titleText);

  const rawDesc = descName ? stringify(getFieldValue(source, descName)) : undefined;
  const snippetHtml =
    descName && pickHighlight(highlights, descName)
      ? pickHighlight(highlights, descName)!
      : rawDesc
        ? escapeHtml(truncate(rawDesc, 180))
        : null;

  const image = imageName ? stringify(getFieldValue(source, imageName)) : undefined;
  const url = linkName ? stringify(getFieldValue(source, linkName)) : undefined;

  const priceRaw = priceField ? getFieldValue(source, priceField) : undefined;
  const price = formatPrice(priceRaw);

  const ratingRaw = ratingField ? getFieldValue(source, ratingField) : undefined;
  const rating = typeof ratingRaw === 'number' ? ratingRaw : ratingRaw != null ? Number(ratingRaw) : undefined;
  const ratingClean = Number.isFinite(rating) ? (rating as number) : undefined;

  const badge = badgeField ? stringify(getFieldValue(source, badgeField)) : undefined;

  return {
    titleHtml,
    snippetHtml,
    image,
    url,
    price,
    rating: ratingClean,
    badge,
  };
}

function formatPrice(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number') {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    } catch {
      return `$${value.toFixed(2)}`;
    }
  }
  if (typeof value === 'string') {
    // Admin may have pre-formatted the field. Trust it if it contains a currency hint.
    if (/[$€£¥]/.test(value)) return value;
    const num = parseFloat(value);
    if (Number.isFinite(num)) return formatPrice(num);
    return value;
  }
  return undefined;
}

/** Return the first (by `order`) fieldName for a role, if the experience defines one. */
function resolveField(displayConfig: DisplayConfig | null, role: DisplayFieldRole): string | undefined {
  if (!displayConfig?.displayFields) return undefined;
  const match = [...displayConfig.displayFields]
    .filter((f: DisplayField) => f.role === role)
    .sort((a, b) => a.order - b.order)[0];
  return match?.fieldName;
}

/** Supports dot-paths like `product.name` — matches the backend's getFieldValue behaviour. */
function getFieldValue(source: Record<string, unknown>, fieldName: string): unknown {
  const parts = fieldName.split('.');
  let v: unknown = source;
  for (const part of parts) {
    if (v && typeof v === 'object') {
      v = (v as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return v;
}

function stringify(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

function pickFirstPresent(source: Record<string, unknown>, candidates: string[]): string | undefined {
  for (const c of candidates) {
    const v = getFieldValue(source, c);
    if (typeof v === 'string' && v.length > 0) return c;
    if (typeof v === 'number' || typeof v === 'boolean') return c;
  }
  return undefined;
}

function pickHighlight(highlights: Record<string, string[] | undefined>, fieldName: string): string | undefined {
  const direct = highlights[fieldName];
  if (Array.isArray(direct) && direct.length > 0 && typeof direct[0] === 'string') return direct[0];
  // Elasticsearch sometimes prefixes highlight keys with sub-field analyzers.
  for (const key of Object.keys(highlights)) {
    if (key === fieldName || key.startsWith(`${fieldName}.`)) {
      const arr = highlights[key];
      if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'string') return arr[0];
    }
  }
  return undefined;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n).trimEnd() + '…';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Sanitize highlighted HTML — keep only <mark> plus whatever DOMPurify allows by default. */
function sanitizeHighlighted(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['mark', 'b', 'strong', 'em', 'i'],
    ALLOWED_ATTR: [],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Icons + kbd hint chip
// ─────────────────────────────────────────────────────────────────────────────

function Kbd({ label }: { label: string }) {
  return <kbd class="ik-kbd">{label}</kbd>;
}

/**
 * Category chips — a single row of pills derived from the first `terms`
 * facet in the response. One-click narrowing; click the same pill again to
 * clear. We stop at the first terms facet deliberately: richer faceted
 * browsing (multi-select, ranges, sort) belongs on the future full-page
 * search product.
 */
function CategoryChips({
  facets,
  activeChip,
  onToggle,
}: {
  facets: Facet[];
  activeChip: { field: string; value: string } | null;
  onToggle: (field: string, value: string) => void;
}) {
  // Only render when we have a terms facet with at least 2 buckets — a
  // single-bucket facet offers no filtering value and just adds chrome.
  const primary = facets.find((f) => f.type === 'terms' && (f.buckets?.length ?? 0) >= 2);
  if (!primary) return null;

  // Cap to the 6 most populous buckets to keep the row compact.
  const visible = primary.buckets.slice(0, 6);
  const label = primary.label ?? humanize(primary.field);

  return (
    <div class="ik-chips-row" aria-label={`Filter by ${label}`}>
      <span class="ik-chips-label">{label}:</span>
      {visible.map((b) => {
        const isActive = activeChip?.field === primary.field && activeChip.value === b.key;
        return (
          <button
            key={b.key}
            type="button"
            class={`ik-chip ik-chip--facet${isActive ? ' ik-chip--active' : ''}`}
            onClick={() => onToggle(primary.field, b.key)}
            aria-pressed={isActive}
          >
            <span>{b.key}</span>
            <span class="ik-chip-count">{b.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Turn `contentType` → `Content type`. Fallback when the backend didn't ship a label. */
function humanize(field: string): string {
  const spaced = field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function AiSummary({ text, streaming }: { text: string; streaming: boolean }) {
  const isEmpty = !text && streaming;
  return (
    <div class="ik-summary">
      <div class="ik-summary-header">
        <SparkleIcon />
        <span>AI summary</span>
      </div>
      <div class={`ik-summary-body${isEmpty ? ' ik-summary-body--loading' : ''}`}>
        {isEmpty ? 'Summarizing results…' : text}
        {streaming && !isEmpty && <span class="ik-summary-caret" aria-hidden="true" />}
      </div>
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true">
      <path
        d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z"
        fill="currentColor"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" class="ik-result-arrow" aria-hidden="true">
      <path
        d="M7 17L17 7M17 7H9M17 7v8"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
