// src/shared/help/help.server.ts
//
// Server-side reader for end-user documentation. Reads markdown from
// src/content/docs at request time (Node runtime), strips Docusaurus-style
// frontmatter, and derives a title from the first H1.
//
// Never import this from client components — it touches the filesystem.

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { deriveTitle, parseFrontmatter, stripFrontmatter } from './markdown';

/** Absolute path to the end-user docs tree. */
const DOCS_ROOT = path.resolve(process.cwd(), 'src', 'content', 'docs');

export interface HelpDoc {
  title: string;
  content: string;
}

/**
 * Read an end-user doc by slug (e.g. "guides/add-tools-to-your-chat").
 * Returns null if the slug escapes the docs root or the file is missing.
 */
export async function readHelpDoc(docSlug: string): Promise<HelpDoc | null> {
  // Normalize and reject anything that tries to climb out of the docs tree.
  const cleaned = docSlug.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!cleaned || cleaned.includes('\0')) return null;

  const filePath = path.resolve(DOCS_ROOT, `${cleaned}.md`);
  if (filePath !== DOCS_ROOT && !filePath.startsWith(DOCS_ROOT + path.sep)) {
    return null;
  }

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const fm = parseFrontmatter(raw);
    const content = stripFrontmatter(raw);
    return { title: fm.title ?? deriveTitle(content) ?? 'Documentation', content };
  } catch {
    return null;
  }
}

export interface DocEntry {
  slug: string;
  title: string;
  position: number;
}

export interface DocGroup {
  id: string;
  title: string;
  position: number;
  docs: DocEntry[];
}

export interface DocsTree {
  /** Standalone docs at the root of /content/docs (e.g. intro.md). */
  root: DocEntry[];
  /** Subfolders, ordered by GROUP_ORDER then alphabetical. */
  groups: DocGroup[];
}

/** Stable display order for the top-level docs folders. Unlisted folders sort last alphabetically. */
const GROUP_ORDER = ['getting-started', 'admin-tour', 'concepts', 'guides'];

const GROUP_TITLES: Record<string, string> = {
  'getting-started': 'Getting started',
  'admin-tour': 'Admin tour',
  concepts: 'Concepts',
  guides: 'Guides',
};

function humanize(id: string): string {
  return id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Walk the docs tree and return a structured listing for the docs site
 * navigation. Excludes the landing `index.md` from group listings — it's
 * surfaced as the `/docs` root.
 */
export async function listDocs(): Promise<DocsTree> {
  const root: DocEntry[] = [];
  const groupsMap = new Map<string, DocGroup>();

  async function walk(dir: string, relParts: string[]) {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, [...relParts, entry.name]);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const name = entry.name.slice(0, -3);
      const slugParts = [...relParts, name];
      const slug = slugParts.join('/');

      let raw: string;
      try {
        raw = await fs.readFile(full, 'utf8');
      } catch {
        continue;
      }
      const fm = parseFrontmatter(raw);
      const title = fm.title ?? deriveTitle(stripFrontmatter(raw)) ?? humanize(name);
      const position = fm.sidebar_position ?? 999;
      const item: DocEntry = { slug, title, position };

      if (relParts.length === 0) {
        // Hide the landing index from listings — it's the /docs root.
        if (name === 'index') continue;
        root.push(item);
      } else {
        const groupId = relParts[0];
        const existing = groupsMap.get(groupId);
        if (existing) {
          existing.docs.push(item);
        } else {
          const orderIndex = GROUP_ORDER.indexOf(groupId);
          groupsMap.set(groupId, {
            id: groupId,
            title: GROUP_TITLES[groupId] ?? humanize(groupId),
            position: orderIndex === -1 ? 999 : orderIndex,
            docs: [item],
          });
        }
      }
    }
  }

  await walk(DOCS_ROOT, []);

  root.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  const groups = Array.from(groupsMap.values()).sort(
    (a, b) => a.position - b.position || a.title.localeCompare(b.title),
  );
  for (const g of groups) {
    g.docs.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  }

  return { root, groups };
}
