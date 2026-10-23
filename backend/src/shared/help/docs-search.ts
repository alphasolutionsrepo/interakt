// src/shared/help/docs-search.ts
//
// Client for in-app docs search: queries the seeded docs search experience
// (src/shared/seeders/docs/docs-search.seeder.ts) through the same slug route
// the playground uses, authenticated by the signed-in session. Pure helpers
// here; the React hook is useDocsSearch.ts.

import { DOCS_SEARCH_SLUG } from './help-content';

export interface DocsSearchHit {
  id: string;
  /** Doc slug ("concepts/tools") and heading anchor, for opening in the help drawer. */
  slug: string;
  anchor: string | null;
  url: string;
  group: string;
  docTitle: string;
  section: string | null;
  /** Safe HTML: escaped text with matches wrapped in <mark>. */
  titleHtml: string;
  sectionHtml: string | null;
  snippetHtml: string;
}

export interface DocsSearchResponse {
  hits: DocsSearchHit[];
  /** Groups with matches, for the filter chips. */
  groups: string[];
  tookMs: number;
}

/** Thrown when docs search isn't available (not built yet, or the engine is down). */
export class DocsSearchUnavailableError extends Error {}

interface RawHit {
  id: string;
  fields: Record<string, unknown>;
  highlights?: Record<string, string[]>;
}

interface RawResponse {
  success: boolean;
  data?: {
    results: RawHit[];
    facets?: Record<string, { buckets: Array<{ key: string; doc_count: number }> }>;
    timing: { totalMs: number };
  };
}

const PAGE_SIZE = 8;
const SNIPPET_CHARS = 180;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * The search API marks matches with <em>…</em> inside otherwise raw text. Escape
 * everything, then let only those markers through, as <mark>.
 */
export function highlightToHtml(fragment: string): string {
  return escapeHtml(fragment).replace(/&lt;em&gt;/g, '<mark>').replace(/&lt;\/em&gt;/g, '</mark>');
}

function snippet(hit: RawHit): string {
  const fragments = hit.highlights?.content;
  if (fragments?.length) return highlightToHtml(fragments.slice(0, 2).join(' … '));
  const content = String(hit.fields.content ?? '');
  return escapeHtml(content.length > SNIPPET_CHARS ? `${content.slice(0, SNIPPET_CHARS).trimEnd()}…` : content);
}

export function toHit(raw: RawHit): DocsSearchHit {
  const f = raw.fields;
  const docTitle = String(f.docTitle ?? '');
  const section = f.section ? String(f.section) : null;
  return {
    id: raw.id,
    slug: String(f.slug ?? ''),
    anchor: f.anchor ? String(f.anchor) : null,
    url: String(f.url ?? `/docs/${f.slug ?? ''}`),
    group: String(f.group ?? ''),
    docTitle,
    section,
    titleHtml: raw.highlights?.docTitle?.[0] ? highlightToHtml(raw.highlights.docTitle[0]) : escapeHtml(docTitle),
    sectionHtml: section
      ? raw.highlights?.section?.[0]
        ? highlightToHtml(raw.highlights.section[0])
        : escapeHtml(section)
      : null,
    snippetHtml: snippet(raw),
  };
}

/**
 * Search the docs. Short queries are sent as keyword search — a fragment like
 * "gu" has no meaning to embed, and skipping it saves an embedding call per
 * keystroke. From three characters on, 'auto' uses the index's own type
 * (hybrid once an embedding model is configured).
 */
export async function searchDocs(
  query: string,
  options: { group?: string | null; signal?: AbortSignal } = {},
): Promise<DocsSearchResponse> {
  const q = query.trim();
  let res: Response;
  try {
    res = await fetch(`/api/v1/search/${DOCS_SEARCH_SLUG}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        query: q,
        pageSize: PAGE_SIZE,
        searchType: q.length < 3 ? 'lexical' : 'auto',
        includeHighlights: true,
        facets: [{ field: 'group', size: 10 }],
        ...(options.group && { filters: [{ field: 'group', operator: 'eq', value: options.group }] }),
      }),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new DocsSearchUnavailableError((e as Error).message);
  }

  // 404: not built yet. 5xx: engine down or index not ready.
  if (res.status === 404 || res.status >= 500) throw new DocsSearchUnavailableError(`HTTP ${res.status}`);
  const json = (await res.json().catch(() => null)) as RawResponse | null;
  if (!res.ok || !json?.success || !json.data) throw new Error(`Search failed (HTTP ${res.status})`);

  const { data } = json;
  return {
    hits: data.results.map(toHit),
    groups: (data.facets?.group?.buckets ?? []).map((b) => b.key),
    tookMs: data.timing.totalMs,
  };
}

// ---------------------------------------------------------------------------
// Fallback: page titles, when full-text search isn't available
// ---------------------------------------------------------------------------

export interface DocListEntry {
  slug: string;
  title: string;
  group: string;
}

interface DocsTreeResponse {
  root: Array<{ slug: string; title: string }>;
  groups: Array<{ title: string; docs: Array<{ slug: string; title: string }> }>;
}

let docListPromise: Promise<DocListEntry[]> | null = null;

/** Every doc's title and group, from GET /api/help (fetched once per page load). */
export function loadDocList(): Promise<DocListEntry[]> {
  docListPromise ??= fetch('/api/help')
    .then((r) => (r.ok ? (r.json() as Promise<DocsTreeResponse>) : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((tree) => [
      ...tree.root.map((d) => ({ slug: d.slug, title: d.title, group: 'Overview' })),
      ...tree.groups.flatMap((g) => g.docs.map((d) => ({ slug: d.slug, title: d.title, group: g.title }))),
    ])
    .catch((e) => {
      docListPromise = null;
      throw e;
    });
  return docListPromise;
}

/** Title-only matching for the fallback: every query word must appear in the title. */
export function filterDocList(docs: DocListEntry[], query: string, group?: string | null): DocsSearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return docs
    .filter((d) => !group || d.group === group)
    .filter((d) => words.every((w) => d.title.toLowerCase().includes(w)))
    .slice(0, PAGE_SIZE)
    .map((d) => ({
      id: d.slug,
      slug: d.slug,
      anchor: null,
      url: d.slug === 'index' ? '/docs' : `/docs/${d.slug}`,
      group: d.group,
      docTitle: d.title,
      section: null,
      titleHtml: highlightWords(d.title, words),
      sectionHtml: null,
      snippetHtml: '',
    }));
}

function highlightWords(text: string, words: string[]): string {
  if (words.length === 0) return escapeHtml(text);
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text
    .split(pattern)
    .map((part, i) => (i % 2 === 1 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)))
    .join('');
}
