// src/shared/help/rehype-heading-ids.ts
//
// Rehype plugin for the docs renderer: gives every heading an id from
// createSlugger(), in document order — the same ids the docs search index
// stores per section, so `/docs/<slug>#<anchor>` lands on the right heading.

import type { Element, Root, RootContent } from 'hast';

import { createSlugger } from './markdown';

const HEADING = /^h[1-6]$/;

function textOf(node: RootContent): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element') return node.children.map(textOf).join('');
  return '';
}

export function rehypeHeadingIds() {
  return (tree: Root) => {
    const slug = createSlugger();
    const visit = (nodes: RootContent[]) => {
      for (const node of nodes) {
        if (node.type !== 'element') continue;
        if (HEADING.test(node.tagName)) {
          (node as Element).properties = { ...node.properties, id: slug(textOf(node).trim()) };
        } else {
          visit(node.children);
        }
      }
    };
    visit(tree.children);
  };
}
