// src/shared/access/PageAccessGate.tsx

'use client';

import { Lock } from 'lucide-react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { useAccess } from './useAccess';

import { canOpenPage } from '@/features/access/page-permissions';


/**
 * Renders the page only for a role that can open it (page-permissions.ts); otherwise a short
 * "no access" panel, so a user who opens a URL their role doesn't cover sees why instead of a
 * page of failing requests. The API refuses the same requests regardless.
 */
export function PageAccessGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { can, isLoading } = useAccess();
  if (isLoading) return null;
  if (canOpenPage(pathname, can)) return <>{children}</>;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
        <Lock className="size-6 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">You don&apos;t have access to this page</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Your role doesn&apos;t include this area. Ask an admin if you need it.
      </p>
    </div>
  );
}
