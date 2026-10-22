'use client';

// src/shared/ui/custom/HelpButton.tsx
//
// The universal help affordance: one ? in the app header opens a drawer with a
// single box and a Search | Ask AI switch. The user picks the mode — it never
// changes on its own:
//   - Search: results from every section of the docs as you type; a result
//     opens in the drawer at its section (on /docs it navigates the page).
//   - Ask AI: Enter sends the question to the Help Assistant; the answer
//     streams in place and the conversation lasts until the drawer closes.
// With an empty box the drawer shows the doc for the current screen (resolved
// from the pathname, see help-content.ts). Ctrl/⌘+K opens it from anywhere in
// the last mode used; other components open it via help-events.ts. Docs render
// through <DocBody>, the same component the /docs site uses.

import { ArrowUp, BookOpen, ChevronLeft, ExternalLink, HelpCircle, Loader2, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { DocsSearchResults, RESULTS_ID, resultRowId } from './DocsSearchResults';
import { AskIntro, AssistantNotReady, HelpConversation, askSuggestions, useHelpChat } from './HelpChat';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { DocBody } from '@/shared/help/DocBody';
import type { DocsSearchHit } from '@/shared/help/docs-search';
import { resolveHelpForPath } from '@/shared/help/help-content';
import { OPEN_HELP_EVENT, type HelpMode, type OpenHelpDetail } from '@/shared/help/help-events';
import { useDocsSearch } from '@/shared/help/useDocsSearch';

/** The last mode used, remembered for the browser session. */
const MODE_KEY = 'interakt.help.mode';

interface DocState {
  title: string;
  content: string | null;
  loading: boolean;
  error: string | null;
}

export function HelpButton() {
  const pathname = usePathname();
  const router = useRouter();
  const target = resolveHelpForPath(pathname);
  const onDocsSite = pathname === '/docs' || pathname.startsWith('/docs/');

  const [open, setOpen] = useState(false);
  const [mode, setModeState] = useState<HelpMode>('search');
  const [text, setText] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  /** True while a doc opened from the search results is showing (Back returns to them). */
  const [showingHit, setShowingHit] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const chat = useHelpChat();
  const search = useDocsSearch(mode === 'search' ? text : '', group);
  const showResults = mode === 'search' && !!text.trim() && !showingHit;

  // ---- Docs shown in the drawer: a stack, so internal links can go Back ----

  const [stack, setStack] = useState<string[]>([]);
  const [docs, setDocs] = useState<Record<string, DocState>>({});
  const cache = useRef<Record<string, { title: string; content: string }>>({});
  /** A heading to scroll to once the doc opened from a search result renders. */
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const readRef = useRef<HTMLDivElement>(null);
  const currentSlug = stack[stack.length - 1] ?? null;
  const cur = currentSlug ? docs[currentSlug] : null;

  const loadDoc = useCallback(async (slug: string) => {
    const cached = cache.current[slug];
    if (cached) {
      setDocs((d) => ({ ...d, [slug]: { ...cached, loading: false, error: null } }));
      return;
    }
    setDocs((d) => ({ ...d, [slug]: { title: slug, content: null, loading: true, error: null } }));
    try {
      const res = await fetch(`/api/help/${slug}`);
      if (!res.ok) throw new Error('not found');
      const data = (await res.json()) as { title: string; content: string };
      cache.current[slug] = { title: data.title, content: data.content };
      setDocs((d) => ({ ...d, [slug]: { title: data.title, content: data.content, loading: false, error: null } }));
    } catch {
      setDocs((d) => ({
        ...d,
        [slug]: { title: 'Not available', content: null, loading: false, error: "This article isn't available yet." },
      }));
    }
  }, []);

  const resetToScreenDoc = useCallback(() => {
    if (target) {
      setStack([target.doc]);
      void loadDoc(target.doc);
    } else {
      setStack([]);
    }
  }, [target, loadDoc]);

  const pushDoc = useCallback(
    (slug: string) => {
      setStack((s) => [...s, slug]);
      void loadDoc(slug);
    },
    [loadDoc],
  );

  // ---- Opening, closing, mode ----

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
    try {
      const saved = sessionStorage.getItem(MODE_KEY);
      if (saved === 'search' || saved === 'ask') setModeState(saved);
    } catch {
      // Storage unavailable — default mode.
    }
  }, []);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  /**
   * Switch mode. Focus moves to the box, except when the switch was made with
   * the arrow keys on the mode radios — keyboard users stay on the radio group.
   */
  const setMode = useCallback(
    (next: HelpMode, options: { keepFocus?: boolean } = {}) => {
      setModeState(next);
      setShowingHit(false);
      try {
        sessionStorage.setItem(MODE_KEY, next);
      } catch {
        // Storage unavailable — the mode just isn't remembered.
      }
      if (!options.keepFocus) focusInput();
    },
    [focusInput],
  );

  const openDrawer = useCallback(
    (nextMode?: HelpMode) => {
      if (!open) resetToScreenDoc();
      setOpen(true);
      if (nextMode) setMode(nextMode);
      focusInput();
    },
    [open, resetToScreenDoc, setMode, focusInput],
  );

  // Closing ends the conversation and clears the box.
  const { reset: resetChat, send: sendChat, busy: chatBusy } = chat;
  const closeDrawer = useCallback(() => {
    setOpen(false);
    setText('');
    setGroup(null);
    setShowingHit(false);
    resetChat();
  }, [resetChat]);

  const handleOpenChange = useCallback(
    (next: boolean) => (next ? openDrawer() : closeDrawer()),
    [openDrawer, closeDrawer],
  );

  // Ctrl/⌘+K from anywhere, and requests from other components.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        if (open) inputRef.current?.select();
        else openDrawer();
      }
    };
    const onOpenHelp = (e: Event) => openDrawer((e as CustomEvent<OpenHelpDetail>).detail?.mode);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_HELP_EVENT, onOpenHelp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_HELP_EVENT, onOpenHelp);
    };
  }, [open, openDrawer]);

  // ---- Search ----

  useEffect(() => setSelected(0), [search.hits]);

  // A group filter with no matches for the new query would strand the user.
  useEffect(() => {
    if (group && search.status === 'ready' && !search.groups.includes(group)) setGroup(null);
  }, [group, search.status, search.groups]);

  const openHit = useCallback(
    (hit: DocsSearchHit) => {
      // On /docs the page itself is the reader.
      if (onDocsSite) {
        closeDrawer();
        router.push(hit.url);
        return;
      }
      setStack([hit.slug]);
      void loadDoc(hit.slug);
      setPendingAnchor(hit.anchor);
      setShowingHit(true);
    },
    [onDocsSite, closeDrawer, router, loadDoc],
  );

  const backToResults = useCallback(() => {
    setShowingHit(false);
    resetToScreenDoc();
    focusInput();
  }, [resetToScreenDoc, focusInput]);

  // ---- Ask ----

  const ask = useCallback(
    (question: string) => {
      if (!question.trim() || chatBusy) return;
      void sendChat(question);
      setText('');
    },
    [chatBusy, sendChat],
  );

  /** "Ask AI about … instead" — the user's explicit hand-off from Search. */
  const askInstead = useCallback(
    (question: string) => {
      setMode('ask');
      ask(question);
    },
    [setMode, ask],
  );

  // ---- The box ----

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mode === 'ask') {
      if (e.key === 'Enter') {
        e.preventDefault();
        ask(text);
      }
      return;
    }
    if (!showResults) return;
    const rows = search.hits.length + 1; // hits + the Ask row
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => (s + 1) % rows);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => (s - 1 + rows) % rows);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = search.hits[selected];
      if (hit) openHit(hit);
      else askInstead(text.trim());
    }
  };

  // ---- Doc scrolling ----

  // A newly opened doc starts at the top…
  useEffect(() => {
    if (readRef.current) readRef.current.scrollTop = 0;
  }, [currentSlug]);

  // …unless it came from a search result: then scroll the drawer (not the page
  // behind it) to the section once it renders.
  useEffect(() => {
    if (!pendingAnchor || !cur?.content) return;
    const frame = requestAnimationFrame(() => {
      readRef.current?.querySelector(`[id="${CSS.escape(pendingAnchor)}"]`)?.scrollIntoView({ block: 'start' });
      setPendingAnchor(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingAnchor, cur?.content]);

  const docPane = (intro?: React.ReactNode) => (
    <div ref={readRef} className="min-h-0 flex-1 overflow-y-auto">
      {intro && <div className="border-b border-border/60 p-4">{intro}</div>}
      {currentSlug && (
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur">
          {(stack.length > 1 || showingHit) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-muted-foreground"
              onClick={stack.length > 1 ? () => setStack((s) => s.slice(0, -1)) : backToResults}
            >
              <ChevronLeft className="size-4" />
              {stack.length > 1 ? 'Back' : 'Results'}
            </Button>
          )}
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {cur?.content && cur.title !== currentSlug ? cur.title : target?.title ?? 'Documentation'}
          </p>
          <Link
            href={`/docs/${currentSlug}`}
            onClick={closeDrawer}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Open in docs <ExternalLink className="size-3" />
          </Link>
        </div>
      )}
      <div className="p-6 text-sm leading-relaxed">
        {!currentSlug && (
          <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
            <BookOpen className="size-8 opacity-50" />
            <p className="font-medium text-foreground">No help for this screen yet</p>
            <p className="max-w-xs text-xs">
              Search the docs or ask a question above, or{' '}
              <Link href="/docs" onClick={closeDrawer} className="font-medium text-primary hover:underline">
                browse the full docs
              </Link>
              .
            </p>
          </div>
        )}
        {currentSlug && cur?.loading && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </p>
        )}
        {currentSlug && cur?.error && <p className="text-sm text-destructive">{cur.error}</p>}
        {currentSlug && cur?.content && (
          <DocBody slug={currentSlug} content={cur.content} onInternalLink={pushDoc} headingAnchors />
        )}
      </div>
    </div>
  );

  const shortcut = isMac ? '⌘K' : 'Ctrl K';

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Help, search and ask"
              className="text-muted-foreground hover:text-foreground"
            >
              <HelpCircle className="size-5" />
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Help, search &amp; ask · {shortcut}</TooltipContent>
      </Tooltip>

      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        // Esc clears the box first; a second Esc closes the drawer.
        onEscapeKeyDown={(e) => {
          if (text) {
            e.preventDefault();
            setText('');
            setShowingHit(false);
          }
        }}
      >
        <SheetHeader className="gap-3 border-b border-border/60 p-4">
          <div>
            <SheetTitle>Help</SheetTitle>
            <SheetDescription>Search the docs, or ask the Help Assistant.</SheetDescription>
          </div>

          <ModeSwitch mode={mode} onChange={setMode} />

          <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
            {mode === 'search' ? (
              <Search className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Sparkles className="size-4 shrink-0 text-primary" />
            )}
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setShowingHit(false);
              }}
              onKeyDown={onInputKeyDown}
              placeholder={mode === 'search' ? 'Search the docs…' : 'Ask a question about Interakt…'}
              aria-label={mode === 'search' ? 'Search the docs' : 'Ask the Help Assistant'}
              // Search mode is a combobox: focus stays here while the arrow keys
              // move through the results, announced via aria-activedescendant.
              {...(mode === 'search' && {
                role: 'combobox',
                'aria-autocomplete': 'list' as const,
                'aria-expanded': showResults,
                'aria-controls': RESULTS_ID,
                'aria-activedescendant': showResults ? resultRowId(selected) : undefined,
              })}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {mode === 'search' && search.status === 'loading' && (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            )}
            {mode === 'search' && !text && (
              <kbd className="hidden shrink-0 rounded border border-border/80 bg-muted px-1.5 font-sans text-[10px] text-muted-foreground sm:inline">
                {shortcut}
              </kbd>
            )}
            {mode === 'ask' && (
              <Button
                type="button"
                size="icon"
                className="size-7 shrink-0"
                disabled={!text.trim() || chat.busy}
                onClick={() => ask(text)}
                aria-label="Ask"
              >
                {chat.busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
              </Button>
            )}
          </div>
        </SheetHeader>

        {mode === 'search' ? (
          showResults ? (
            <DocsSearchResults
              query={text}
              search={search}
              group={group}
              onGroupChange={setGroup}
              selected={selected}
              onHover={setSelected}
              onOpen={openHit}
              onAsk={askInstead}
            />
          ) : (
            docPane()
          )
        ) : chat.notReady ? (
          <AssistantNotReady />
        ) : chat.messages.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <HelpConversation messages={chat.messages} onSourceClick={closeDrawer} />
          </div>
        ) : (
          docPane(<AskIntro suggestions={askSuggestions(target?.title)} onAsk={ask} />)
        )}
      </SheetContent>
    </Sheet>
  );
}

const MODES: Array<{ value: HelpMode; label: string; Icon: typeof Search }> = [
  { value: 'search', label: 'Search', Icon: Search },
  { value: 'ask', label: 'Ask AI', Icon: Sparkles },
];

/**
 * The Search | Ask AI switch, as a standard ARIA radio group: Tab reaches the
 * checked option (one tab stop for the group), arrow keys move between options
 * and select them, and a click selects and moves to the box.
 */
function ModeSwitch({
  mode,
  onChange,
}: {
  mode: HelpMode;
  onChange: (mode: HelpMode, options?: { keepFocus?: boolean }) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + MODES.length) % MODES.length;
    onChange(MODES[next].value, { keepFocus: true });
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="Mode" className="inline-flex self-start rounded-lg bg-muted p-0.5 text-sm">
      {MODES.map(({ value, label, Icon }, i) => {
        const active = mode === value;
        return (
          <button
            key={value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" aria-hidden /> {label}
          </button>
        );
      })}
    </div>
  );
}
