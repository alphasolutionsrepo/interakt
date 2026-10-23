// src/shared/help/markdown.ts
//
// Pure helpers for working with our end-user docs markdown (no fs, no React),
// so they're safe to import from the server reader, the docs seeder, and tests.

export interface DocFrontmatter {
  title?: string;
  sidebar_position?: number;
  slug?: string;
}

/** Remove a leading `--- ... ---` Docusaurus-style frontmatter block if present. */
export function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---')) return raw;
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return raw;
  // Advance past the closing fence and its trailing newline.
  const after = raw.indexOf('\n', end + 1);
  return after === -1 ? '' : raw.slice(after + 1).replace(/^\s+/, '');
}

/**
 * Parse the leading Docusaurus-style frontmatter block. Supports only the
 * small set of scalar keys we actually use in our docs — `title`,
 * `sidebar_position`, `slug`. Returns an empty object if none is present.
 */
export function parseFrontmatter(raw: string): DocFrontmatter {
  if (!raw.startsWith('---')) return {};
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return {};
  const block = raw.slice(3, end);
  const out: DocFrontmatter = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^\s*([a-zA-Z_][\w-]*)\s*:\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === 'sidebar_position') {
      const n = Number(value);
      if (Number.isFinite(n)) out.sidebar_position = n;
    } else if (key === 'title' || key === 'slug') {
      out[key] = value;
    }
  }
  return out;
}

/** Pull the first `# Heading` as the doc title, or null if there isn't one. */
export function deriveTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+?)\s*$/m);
  return match ? match[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Heading anchors
//
// The docs renderer (DocBody) gives every heading an id, and the docs search
// index stores the same id per section so a result can link straight to it.
// Both sides go through createSlugger() over the headings in document order,
// so the ids always agree.
// ---------------------------------------------------------------------------

/** GitHub-style anchor for a heading's plain text: "Step 2 — Search settings" → "step-2--search-settings". */
export function headingSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** Returns a function that slugs headings in order, suffixing repeats (-1, -2, …) like GitHub does. */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = headingSlug(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/**
 * Drop HTML tags, repeating until nothing changes so nested or broken tags
 * (`<<b>b>`) can't leave one behind. Not a sanitiser — callers still escape
 * the text before rendering it as HTML.
 */
function stripTags(text: string): string {
  let previous: string;
  let current = text;
  do {
    previous = current;
    current = current.replace(/<[^<>]*>/g, '');
  } while (current !== previous);
  return current;
}

/**
 * Inline markdown to the text a reader sees: links and images keep their label,
 * code spans keep their content, emphasis markers and HTML tags go. This is
 * also the text the renderer slugs a heading from, so it must match what
 * react-markdown puts in the heading.
 *
 * The result is plain text for indexing and anchors, not safe HTML: escape it
 * before rendering (docs-search.ts does).
 */
export function inlineToText(markdown: string): string {
  // Code spans are literal: park them behind placeholders (emphasis can wrap
  // them, as in **see `x` here**), strip the markup, then put them back.
  const code: string[] = [];
  const parked = markdown.replace(/`+([^`]*)`+/g, (_, inner: string) => `\u0000${code.push(inner) - 1}\u0000`);
  const withoutLinks = parked
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  return stripTags(withoutLinks)
    .replace(/(\*\*|__|~~)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?!\s)(.+?)\*(?!\w)/g, '$1$2')
    .replace(/(^|\W)_(?!\s)(.+?)_(?!\w)/g, '$1$2')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e])
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, '$1')
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => code[Number(i)]);
}

/** A block of markdown to plain, single-spaced text for indexing (code is kept, markup is not). */
export function markdownToPlainText(markdown: string): string {
  const out: string[] = [];
  // Consecutive prose lines are stripped together: emphasis can span a line break.
  let prose: string[] = [];
  const flushProse = () => {
    if (prose.length) out.push(inlineToText(prose.join(' ')));
    prose = [];
  };
  let fence: string | null = null;

  for (const line of markdown.split('\n')) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      flushProse();
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
      continue;
    }
    if (fence) {
      out.push(line);
      continue;
    }
    if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line)) continue; // table separator row
    if (/^\s*:::/.test(line)) continue; // admonition fence
    // A blank line, heading, list item or table row starts a new block.
    if (!line.trim() || /^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|\|)/.test(line)) flushProse();
    prose.push(
      line
        .replace(/^\s*#{1,6}\s+/, '')
        .replace(/^\s*>\s?/, '')
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
        .replace(/\|/g, ' '),
    );
  }
  flushProse();

  return out.join(' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export interface DocSection {
  /** Heading id to link to (`/docs/<slug>#<anchor>`), or null for the intro before the first `##`. */
  anchor: string | null;
  /** "Heading" for a `##` section, "Parent › Heading" for a `###` one; null for the intro. */
  path: string | null;
  /** The section's own text (including any `####`+ subsections), as plain text. */
  text: string;
}

/**
 * Split a doc into the sections search indexes: the intro, then one per `##`
 * and `###` heading. Headings in code fences are ignored. Every heading feeds
 * the slugger, in order, so anchors match the ids DocBody renders. Sections
 * with no text of their own (a `##` straight into a `###`) are dropped — the
 * `###` sections carry the parent heading in their path.
 */
export function splitSections(markdown: string): DocSection[] {
  const slug = createSlugger();
  const sections: Array<{ anchor: string | null; path: string | null; lines: string[] }> = [];
  let current: (typeof sections)[number] = { anchor: null, path: null, lines: [] };
  let parent: string | null = null;
  let fence: string | null = null;

  for (const line of markdown.split('\n')) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
      current.lines.push(line);
      continue;
    }
    const heading = fence ? null : line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!heading) {
      current.lines.push(line);
      continue;
    }

    const depth = heading[1].length;
    const text = inlineToText(heading[2]).trim();
    const anchor = slug(text);
    if (depth === 1) continue; // the title — it's on every section already
    if (depth > 3) {
      current.lines.push(line);
      continue;
    }

    sections.push(current);
    if (depth === 2) parent = text;
    current = { anchor, path: depth === 3 && parent ? `${parent} › ${text}` : text, lines: [] };
  }
  sections.push(current);

  return sections
    .map((s) => ({ anchor: s.anchor, path: s.path, text: markdownToPlainText(s.lines.join('\n')) }))
    .filter((s) => s.text.length > 0);
}
