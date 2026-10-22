import { promises as fs } from 'node:fs';
import path from 'node:path';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';

import {
  createSlugger,
  headingSlug,
  inlineToText,
  markdownToPlainText,
  splitSections,
  stripFrontmatter,
} from './markdown';
import { rehypeHeadingIds } from './rehype-heading-ids';

describe('headingSlug / createSlugger', () => {
  it('slugs like GitHub', () => {
    expect(headingSlug('Step 2 — Search settings')).toBe('step-2--search-settings');
    expect(headingSlug('Allowed origins (CORS)')).toBe('allowed-origins-cors');
    expect(headingSlug('snake_case & kebab-case')).toBe('snake_case--kebab-case');
  });

  it('suffixes repeated headings in order', () => {
    const slug = createSlugger();
    expect([slug('Example'), slug('Example'), slug('Other'), slug('Example')]).toEqual([
      'example',
      'example-1',
      'other',
      'example-2',
    ]);
  });
});

describe('inlineToText', () => {
  it('keeps link labels and code, drops markup', () => {
    expect(inlineToText('See [the tools](/concepts/tools) and `**not bold**`')).toBe(
      'See the tools and **not bold**',
    );
    expect(inlineToText('**Bold** and *italic* and _under_ and ~~gone~~')).toBe('Bold and italic and under and gone');
    expect(inlineToText('keeps snake_case_names')).toBe('keeps snake_case_names');
    expect(inlineToText('A &amp; B <br/>')).toBe('A & B ');
  });

  it('leaves no tag behind from nested or broken tags', () => {
    // Each pass exposes the next tag; repeating removes it too.
    expect(inlineToText('a <<script>script>alert(1)</script> b')).toBe('a alert(1) b');
    expect(inlineToText('x <scr<script>ipt>y')).toBe('x y');
    for (const input of ['<<script>script>', '<scr<b>ipt>', '<<<i>i>i>']) {
      expect(inlineToText(input)).not.toMatch(/<[a-z]/i);
    }
  });

  it('strips emphasis that wraps a code span', () => {
    expect(inlineToText('**bound to an `allowed-origins` list**')).toBe('bound to an allowed-origins list');
  });
});

describe('markdownToPlainText', () => {
  it('strips list, quote and table markup but keeps code', () => {
    const md = [
      '- one',
      '> quoted',
      '| A | B |',
      '|---|---|',
      '| x | y |',
      '```bash',
      'npm run dev',
      '```',
    ].join('\n');
    expect(markdownToPlainText(md)).toBe('one quoted A B x y npm run dev');
  });

  it('strips emphasis that spans a line break, but not across list items', () => {
    expect(markdownToPlainText('- it is **bound to an\n  allowed-origins list**, so')).toBe(
      'it is bound to an allowed-origins list, so',
    );
    expect(markdownToPlainText('- a *b\n- c* d')).toBe('a *b c* d');
  });
});

describe('splitSections', () => {
  const md = [
    '# Title',
    'Intro text.',
    '## Setup',
    'Setup text.',
    '```md',
    '## not a heading',
    '```',
    '## Options',
    '### Pagination',
    'Page size.',
    '#### Details',
    'Nested.',
    '## Setup',
    'Again.',
  ].join('\n');

  it('splits on ## and ###, with anchors and paths', () => {
    expect(splitSections(md)).toEqual([
      { anchor: null, path: null, text: 'Intro text.' },
      { anchor: 'setup', path: 'Setup', text: 'Setup text. ## not a heading' },
      // "Options" has no text of its own — dropped; Pagination carries it in its path.
      { anchor: 'pagination', path: 'Options › Pagination', text: 'Page size. Details Nested.' },
      { anchor: 'setup-1', path: 'Setup', text: 'Again.' },
    ]);
  });
});

describe('heading ids match section anchors on every real doc', () => {
  const DOCS_ROOT = path.resolve(process.cwd(), 'src', 'content', 'docs');

  it('renders the same ids the search index stores', async () => {
    const entries = await fs.readdir(DOCS_ROOT, { recursive: true, withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => path.join((e as unknown as { parentPath: string }).parentPath, e.name));
    expect(files.length).toBeGreaterThan(20);

    for (const file of files) {
      const content = stripFrontmatter(await fs.readFile(file, 'utf8'));
      const html = renderToStaticMarkup(
        createElement(ReactMarkdown, { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeHeadingIds] }, content),
      );
      const ids = new Set([...html.matchAll(/<h[1-6] id="([^"]*)"/g)].map((m) => m[1]));
      for (const section of splitSections(content)) {
        if (section.anchor) expect(ids, `${path.basename(file)} #${section.anchor}`).toContain(section.anchor);
      }
    }
  });
});
