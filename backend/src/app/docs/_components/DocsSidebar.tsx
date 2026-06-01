'use client';

// src/app/docs/_components/DocsSidebar.tsx
//
// The left-rail navigation for the /docs site. Renders a flat list of
// top-level docs (intro etc.) followed by collapsible-feeling sections
// (Getting started, Concepts, Guides, …) — all linking into the same
// /docs/<slug> route. Highlights the entry that matches the current path.

import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';
import type { DocsTree } from '@/shared/help/help.server';

interface DocsSidebarProps {
  tree: DocsTree;
}

export function DocsSidebar({ tree }: DocsSidebarProps) {
  const pathname = usePathname();
  // pathname is "/docs", "/docs/foo", "/docs/foo/bar"
  const activeSlug = pathname === '/docs' ? '' : pathname.replace(/^\/docs\//, '');

  return (
    <nav className="space-y-5 text-sm">
      <Link
        href="/docs"
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5 font-semibold',
          activeSlug === '' ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
        )}
      >
        <BookOpen className="size-4" /> Documentation
      </Link>

      {tree.root.length > 0 && (
        <ul className="space-y-0.5">
          {tree.root.map((doc) => (
            <SidebarItem key={doc.slug} slug={doc.slug} title={doc.title} active={activeSlug === doc.slug} />
          ))}
        </ul>
      )}

      {tree.groups.map((group) => (
        <div key={group.id}>
          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.docs.map((doc) => (
              <SidebarItem key={doc.slug} slug={doc.slug} title={doc.title} active={activeSlug === doc.slug} />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarItem({ slug, title, active }: { slug: string; title: string; active: boolean }) {
  return (
    <li>
      <Link
        href={`/docs/${slug}`}
        className={cn(
          'block rounded-md px-2 py-1 transition-colors',
          active ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        {title}
      </Link>
    </li>
  );
}
