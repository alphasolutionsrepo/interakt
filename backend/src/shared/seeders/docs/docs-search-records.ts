// src/shared/seeders/docs/docs-search-records.ts
//
// Turns the docs into docs search records: one per section (the intro, then
// each `##` / `###`), so a hit points at the part of the page that matched
// and links straight to it. Pure — no I/O — so it's unit-testable.

import type { DocFile } from './docs-source';

import { docGroupTitle } from '@/shared/help/help.server';
import { inlineToText, splitSections } from '@/shared/help/markdown';

export interface DocsSearchRecord {
  /** Stable document key, safe for every search engine's key rules (no `/` or `#`). */
  id: string;
  docTitle: string;
  /** "Heading" or "Parent › Heading"; absent for a page's intro. */
  section?: string;
  content: string;
  /** Top-level docs folder, as the sidebar titles it ("Concepts"); "Overview" for root pages. */
  group: string;
  slug: string;
  anchor?: string;
  /** In-app URL, e.g. "/docs/concepts/tools#scaffolding". */
  url: string;
}

/** Azure AI Search keys allow letters, digits, `_`, `-` and `=` only — ES is happy with that too. */
function recordId(slug: string, anchor: string | null): string {
  return `${slug.replace(/\//g, '_')}${anchor ? `-${anchor}` : ''}`.replace(/[^A-Za-z0-9_=-]/g, '-');
}

export function buildDocsSearchRecords(docs: DocFile[]): DocsSearchRecord[] {
  const records: DocsSearchRecord[] = [];

  for (const doc of docs) {
    const docTitle = inlineToText(doc.title);
    const groupId = doc.slug.includes('/') ? doc.slug.split('/')[0] : null;
    const group = groupId ? docGroupTitle(groupId) : 'Overview';
    const base = doc.slug === 'index' ? '/docs' : `/docs/${doc.slug}`;

    for (const section of splitSections(doc.content)) {
      records.push({
        id: recordId(doc.slug, section.anchor),
        docTitle,
        ...(section.path && { section: section.path }),
        content: section.text,
        group,
        slug: doc.slug,
        ...(section.anchor && { anchor: section.anchor }),
        url: section.anchor ? `${base}#${section.anchor}` : base,
      });
    }
  }

  return records;
}
