'use client';

// src/shared/help/DocBody.tsx
//
// The single renderer for an end-user docs page. Used by both the /docs site
// and the in-app help drawer so they stay in sync — same markdown styling,
// same link handling. Internal links written in our docs (relative or
// root-relative slugs) are resolved against the current doc and routed to
// `/docs/<slug>`. Callers that want to override the navigation (e.g. the
// drawer browses in-place via a stack) pass `onInternalLink`.

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { Markdown } from '@/components/custom/markdown';
import { resolveDocLink } from '@/shared/help/help-content';
import { rehypeHeadingIds } from '@/shared/help/rehype-heading-ids';

interface DocBodyProps {
  /** Slug of the doc whose content is being rendered (used to resolve relative links). */
  slug: string;
  /** Markdown content, with frontmatter already stripped. */
  content: string;
  /**
   * Override for what to do when the reader clicks an internal doc link.
   * Receives the resolved doc slug (e.g. "concepts/tools"). If omitted,
   * the default behavior is `router.push(`/docs/${resolved}`)`.
   */
  onInternalLink?: (resolvedSlug: string) => void;
  /**
   * Give headings ids, so `/docs/<slug>#<anchor>` links (search results) land
   * on the right section. On for doc pages; off for chat answers.
   */
  headingAnchors?: boolean;
  className?: string;
}

const HEADING_ID_PLUGINS = [rehypeHeadingIds];

export function DocBody({ slug, content, onInternalLink, headingAnchors, className }: DocBodyProps) {
  const router = useRouter();

  const handleLink = useCallback(
    (href: string) => {
      // Links the writer (or LLM) already wrote as full docs URLs (`/docs/...`)
      // are final — don't run them through slug resolution, which would
      // re-prepend `/docs/` and produce `/docs/docs/...`.
      const docsPrefix = href.match(/^\/docs(?:\/(.*))?$/);
      if (docsPrefix) {
        const resolved = (docsPrefix[1] ?? '').replace(/^\/+|\/+$/g, '');
        if (onInternalLink) onInternalLink(resolved);
        else router.push(resolved ? `/docs/${resolved}` : '/docs');
        return;
      }

      const resolved = resolveDocLink(href, slug);
      if (!resolved) return;
      if (onInternalLink) onInternalLink(resolved);
      else router.push(`/docs/${resolved}`);
    },
    [slug, onInternalLink, router],
  );

  return (
    <Markdown
      className={className}
      onInternalLink={handleLink}
      rehypePlugins={headingAnchors ? HEADING_ID_PLUGINS : undefined}
    >
      {content}
    </Markdown>
  );
}
