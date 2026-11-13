// app/analytics/_lib/AskPanelContext.tsx

'use client';

/**
 * The analytics conversation every section shares: inline on the Overview,
 * in the Ask drawer elsewhere. One conversation, so a question started on one
 * page can be followed up on another. Any section can ask a question for the
 * user ("Explain this"). Questions carry the section they were asked from.
 */

import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';


import { useAnalyticsChat } from './hooks/useAnalyticsChat';
import { sectionForPath } from './sections';

import type { Permission } from '@/features/access/permissions';
import type { Area } from '@/features/feature-switches/areas';
import { useAccess } from '@/shared/access/useAccess';

type AnalyticsChat = ReturnType<typeof useAnalyticsChat>;

interface AskPanelState {
  /** Whether the Ask drawer is open (sections other than the Overview) */
  isOpen: boolean;
  /** Open the drawer, asking `question` straight away when given */
  open: (question?: string) => void;
  close: () => void;
  toggle: () => void;
  /** Ask a question from the current section */
  ask: (question: string) => void;
  chat: AnalyticsChat;
  /** The user's role may ask the assistant (analytics:ask); every way in is hidden otherwise */
  canAsk: boolean;
}

/** Asking needs the permission and Analytics on (the Ask routes are refused with it off) */
export function canAskAnalytics(can: (p: Permission) => boolean, areaOn: (a: Area) => boolean): boolean {
  return can('analytics:ask') && areaOn('analytics');
}

const AskPanelContext = createContext<AskPanelState | null>(null);

export function AskPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const chat = useAnalyticsChat();
  const { send } = chat;
  const { can, areaOn } = useAccess();
  const canAsk = canAskAnalytics(can, areaOn);
  // Questions name the analytics section they were asked from; elsewhere (the full chat, the home page) none
  const inSection = pathname.startsWith('/analytics/') && !pathname.startsWith('/analytics/chat');
  const pageSection = inSection ? sectionForPath(pathname).label : undefined;

  const ask = useCallback((question: string) => void send(question, { pageSection }), [send, pageSection]);
  const open = useCallback(
    (question?: string) => {
      setIsOpen(true);
      if (question) ask(question);
    },
    [ask],
  );
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const value = useMemo(
    () => ({ isOpen, open, close, toggle, ask, chat, canAsk }),
    [isOpen, open, close, toggle, ask, chat, canAsk],
  );

  return <AskPanelContext.Provider value={value}>{children}</AskPanelContext.Provider>;
}

export function useAskPanel(): AskPanelState {
  const ctx = useContext(AskPanelContext);
  if (!ctx) throw new Error('useAskPanel must be used inside AskPanelProvider');
  return ctx;
}
