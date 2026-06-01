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
