// src/shared/access/PageAccessGate.tsx

'use client';

import { AlertTriangle, Lock } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useEffect, type ReactNode } from 'react';

import type { ActionGate } from './ActionControls';
import { accessState } from './access-state';
import { useAccess } from './useAccess';

import { Button } from '@/components/ui/button';
import { canOpenPage } from '@/features/access/page-permissions';


function Panel({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">{icon}</div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}

/**
 * Renders the page only for a role that can open it (page-permissions.ts); otherwise says why.
 * The API refuses the same requests regardless; see access-state.ts for each state.
 */
export function PageAccessGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { can, isLoading, errorStatus, retry } = useAccess();
  const state = accessState({ isLoading, errorStatus, canOpen: canOpenPage(pathname, can) });

  useEffect(() => {
    if (state === 'signed-out') void signOut({ callbackUrl: '/login' });
  }, [state]);

  if (state === 'allowed') return <>{children}</>;
  if (state === 'loading' || state === 'signed-out') return null;
  if (state === 'unavailable') {
    return (
      <Panel
        icon={<AlertTriangle className="size-6 text-muted-foreground" />}
        title="Couldn't check your access"
        text="The server didn't answer. Try again in a moment."
        action={<Button variant="outline" onClick={retry}>Try again</Button>}
      />
    );
  }
  return (
    <Panel
      icon={<Lock className="size-6 text-muted-foreground" />}
      title="You don't have access to this page"
      text="Your role doesn't include this area. Ask an admin if you need it."
    />
  );
}

/**
 * In place of a page whose only purpose is an action the user may not take, such as the edit
 * page of the built-in help for a non-Admin: says why, and links back. Nothing while loading.
 */
export function LockedPage({ gate, backHref }: { gate: Exclude<ActionGate, { state: 'allowed' }>; backHref: string }) {
  if (gate.state === 'loading') return null;
  return (
    <Panel
      icon={<Lock className="size-6 text-muted-foreground" />}
      title="You can't change this"
      text={gate.reason}
      action={<Button variant="outline" asChild><Link href={backHref}>Back</Link></Button>}
    />
  );
}
