// src/app/docs/layout.tsx
//
// Docs site layout — two columns inside the global AppShell: a sticky
// secondary nav listing every doc, and the rendered doc content. The
// page-level <DocsSidebar> below highlights the active entry.

import type { ReactNode } from 'react';

import { DocsSidebar } from './_components/DocsSidebar';

import { listDocs } from '@/shared/help/help.server';

export default async function DocsLayout({ children }: { children: ReactNode }) {
  const tree = await listDocs();

  return (
    <div className="flex min-h-full">
      <aside className="hidden w-64 shrink-0 border-r border-border/60 bg-background md:block">
        <div className="sticky top-0 max-h-screen overflow-y-auto p-4">
          <DocsSidebar tree={tree} />
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-3xl px-6 py-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}
