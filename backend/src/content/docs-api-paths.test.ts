// src/content/docs-api-paths.test.ts

/**
 * Every Interakt API path the docs mention is a route the app serves, so a
 * renamed or mistyped endpoint fails here instead of in a reader's terminal.
 *
 * Placeholders in a path (`<slug>`, `{id}`, `${INDEX_ID}`, `$INDEX`, `:id`) and
 * example values (`product-search`, `PROD-001`) match a dynamic route segment.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const DOCS_DIR = join(__dirname, 'docs');
const API_DIR = join(__dirname, '..', 'app', 'api');

// Routes the reader adds to their own app in integration guides; paths on
// another host (https://your-site.com/api/...) are skipped too
const READER_ROUTES = ['/api/interakt/'];
const isInteraktHost = (host: string | undefined) => !host || host.includes('interakt');

// A path, alone or after a host (https://admin.interakt.app/api/...); not app/api/... file paths
const API_PATH = /(?<![\w./])(?:https?:\/\/([\w.:-]+))?(\/api\/[\w./<>{}$:-]+)/g;

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return /\.mdx?$/.test(entry.name) ? [path] : [];
  });
}

/** Whether the app has a route for the path, matching any segment to a [dynamic] one */
function isRoute(path: string): boolean {
  let dirs = [API_DIR];
  for (const segment of path.replace(/^\/api\//, '').split('/').filter(Boolean)) {
    dirs = dirs.flatMap((dir) => {
      if (!existsSync(dir)) return [];
      const children = readdirSync(dir, { withFileTypes: true }).filter((c) => c.isDirectory());
      return children
        .filter((c) => c.name === segment || /^\[[^\]]+\]$/.test(c.name))
        .map((c) => join(dir, c.name));
    });
  }
  return dirs.some((dir) => existsSync(join(dir, 'route.ts')));
}

const mentions = markdownFiles(DOCS_DIR).flatMap((file) =>
  [...readFileSync(file, 'utf8').matchAll(API_PATH)]
    .filter((m) => isInteraktHost(m[1]))
    .map((m) => ({ doc: relative(DOCS_DIR, file), path: m[2].replace(/[.:]+$/, '') })),
);

describe('API paths in the docs', () => {
  it('finds the paths it checks', () => {
    expect(mentions.some((m) => m.path === '/api/v1/search')).toBe(true);
  });

  it('are all routes the app serves', () => {
    const unknown = mentions
      .filter((m) => !READER_ROUTES.some((prefix) => m.path.startsWith(prefix)))
      .filter((m) => !isRoute(m.path))
      .map((m) => `${m.doc}: ${m.path}`);

    expect(unknown).toEqual([]);
  });
});
