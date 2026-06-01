'use client';

// src/shared/ui/custom/HelpButton.tsx
//
// The universal help affordance. One instance lives in the app header and
// shows documentation for whatever screen the user is on, resolved from the
// current pathname (see help-content.ts). Pages without a mapped doc get a
// friendly "coming soon" message. Internal doc links browse within the drawer
// (with a Back button); external links open in a new tab. Reads and renders
// markdown through <DocBody>, the same component the /docs site uses, so the
// two surfaces stay in sync.

import { BookOpen, ChevronLeft, ExternalLink, HelpCircle, Loader2, MessageCircleQuestion } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';

import { HelpChat } from './HelpChat';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { DocBody } from '@/shared/help/DocBody';
import { resolveHelpForPath } from '@/shared/help/help-content';

type HelpTab = 'read' | 'ask';

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors ${
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

interface DocState {
  title: string;
  content: string | null;
  loading: boolean;
  error: string | null;
}

export function HelpButton() {
  const pathname = usePathname();
  const target = resolveHelpForPath(pathname);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<HelpTab>('read');
  const [stack, setStack] = useState<string[]>([]); // doc slugs; last = current
  const [docs, setDocs] = useState<Record<string, DocState>>({});
  const cache = useRef<Record<string, { title: string; content: string }>>({});

  const currentSlug = stack[stack.length - 1] ?? null;

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

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      // Reset to the current screen's doc (Read tab) each time the drawer opens.
      if (next) {
        setTab('read');
        if (target) {
          setStack([target.doc]);
          void loadDoc(target.doc);
        } else {
          setStack([]);
        }
      }
    },
    [target, loadDoc],
  );

  const pushDoc = useCallback(
    (slug: string) => {
      setStack((s) => [...s, slug]);
      void loadDoc(slug);
    },
    [loadDoc],
  );

  const goBack = useCallback(() => setStack((s) => s.slice(0, -1)), []);

  const cur = currentSlug ? docs[currentSlug] : null;
  const headerTitle =
    cur?.content && cur.title !== currentSlug ? cur.title : target?.title ?? 'Help';

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Help"
          className="text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="size-5" />
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border/60 p-4">
          <div className="flex items-center gap-2">
            {tab === 'read' && stack.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={goBack}
                aria-label="Back"
              >
                <ChevronLeft className="size-4" />
              </Button>
            )}
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate">
                {tab === 'ask' ? 'Ask the docs' : target ? headerTitle : 'Help'}
              </SheetTitle>
              <SheetDescription>
                {tab === 'ask' ? 'Answers grounded in the product docs.' : 'Documentation for this screen.'}
              </SheetDescription>
            </div>
            {tab === 'read' && currentSlug && (
              <Link
                href={`/docs/${currentSlug}`}
                onClick={() => setOpen(false)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Open in full documentation"
              >
                Open in docs <ExternalLink className="size-3" />
              </Link>
            )}
          </div>

          {/* Read | Ask tabs */}
          <div className="mt-1 inline-flex rounded-lg bg-muted p-0.5 text-sm">
            <TabButton active={tab === 'read'} onClick={() => setTab('read')}>
              <BookOpen className="size-3.5" /> Read
            </TabButton>
            <TabButton active={tab === 'ask'} onClick={() => setTab('ask')}>
              <MessageCircleQuestion className="size-3.5" /> Ask
            </TabButton>
          </div>
        </SheetHeader>

        {tab === 'ask' ? (
          <HelpChat pageTitle={target?.title} onSourceClick={() => setOpen(false)} />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="p-6 text-sm leading-relaxed">
              {!target && (
                <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
                  <BookOpen className="size-8 opacity-50" />
                  <p className="font-medium text-foreground">Documentation coming soon</p>
                  <p className="max-w-xs text-xs">
                    We haven&apos;t written help for this page yet — but you can still switch to{' '}
                    <span className="font-medium text-foreground">Ask</span> above, or{' '}
                    <Link href="/docs" onClick={() => setOpen(false)} className="font-medium text-primary hover:underline">
                      browse the full docs
                    </Link>
                    .
                  </p>
                </div>
              )}
              {target && cur?.loading && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </p>
              )}
              {target && cur?.error && <p className="text-sm text-destructive">{cur.error}</p>}
              {target && currentSlug && cur?.content && (
                <DocBody slug={currentSlug} content={cur.content} onInternalLink={pushDoc} />
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
