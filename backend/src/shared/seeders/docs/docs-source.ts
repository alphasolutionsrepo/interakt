// src/shared/seeders/docs/docs-source.ts
//
// Reads the end-user docs (src/content/docs) for the docs seeders: the Help
// Assistant's knowledge base and the docs search index both build from this.

import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { eq } from 'drizzle-orm';

import { db } from '@/db/index';
import { user } from '@/db/schema/users.schema';
import { deriveTitle, stripFrontmatter } from '@/shared/help/markdown';

/** Where the end-user docs live (read at runtime from the Node cwd). */
export const DOCS_ROOT = path.resolve(process.cwd(), 'src', 'content', 'docs');

export interface DocFile {
  /** Slug-ish relative path without extension, e.g. "guides/add-tools-to-your-chat". */
  slug: string;
  /** Human title (first H1, falling back to the slug). Used as the document name. */
  title: string;
  /** Markdown body with frontmatter stripped. */
  content: string;
}

/** Recursively read every .md under DOCS_ROOT, frontmatter-stripped. */
export async function readDocs(): Promise<DocFile[]> {
  const entries = await fs.readdir(DOCS_ROOT, { recursive: true, withFileTypes: true });
  const docs: DocFile[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const dir = (entry as unknown as { parentPath?: string; path?: string }).parentPath
      ?? (entry as unknown as { path?: string }).path
      ?? DOCS_ROOT;
    const full = path.join(dir, entry.name);
    const raw = await fs.readFile(full, 'utf8');
    const content = stripFrontmatter(raw).trim();
    if (!content) continue;
    const slug = path.relative(DOCS_ROOT, full).replace(/\\/g, '/').replace(/\.md$/i, '');
    const title = deriveTitle(content) ?? slug;
    docs.push({ slug, title, content });
  }

  // Stable order so the checksum is deterministic.
  docs.sort((a, b) => a.slug.localeCompare(b.slug));
  return docs;
}

/** The docs resources are created as the first admin. */
export async function getAdminUserId(): Promise<string> {
  const admin = await db.query.user.findFirst({ where: eq(user.role, 'admin') });
  if (!admin) {
    throw new Error('No admin user found. An admin user is required to seed the docs.');
  }
  return admin.id;
}
