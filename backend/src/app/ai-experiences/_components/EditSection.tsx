'use client';

/**
 * One numbered stage of the experience configuration.
 *
 * The edit page had eight cards in no stated order, so nothing told the operator that AI
 * configuration matters before guardrails, or that tools have to exist before prompts are
 * worth touching. The creation wizard has always been a sequence; editing dropped that and
 * became a pile of forms.
 *
 * Numbering is the whole mechanism. It costs a line per section and turns a list into an
 * order, which is what "do this, then this, then see it work" needs.
 *
 * `savesImmediately` exists because two save behaviors share this page. Rule lists and
 * attachments persist per change; scalar settings wait for Save at the bottom. Mixing them is
 * a deliberate trade for keeping configuration in one place, and it is only honest if each
 * section says which kind it is.
 */

import { ChevronRight, Zap } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  step: number;
  title: string;
  description?: string;
  /** True when changes here persist on change rather than with the page's Save button. */
  savesImmediately?: boolean;
  children: React.ReactNode;
}

export function EditSection({ step, title, description, savesImmediately, children }: Props) {
  return (
    <Card id={`section-${step}`} className="border-border/60 shadow-sm rounded-2xl scroll-mt-6">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary mt-0.5"
          >
            {step}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
              {savesImmediately && (
                <Badge variant="outline" className="gap-1 text-[10px] font-normal">
                  <Zap className="size-2.5" />
                  Saves as you change it
                </Badge>
              )}
            </div>
            {description && <CardDescription className="mt-1">{description}</CardDescription>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

/**
 * Jump list for the sections above.
 *
 * Scrolling is done here rather than left to the browser's own hash navigation. As a plain
 * `href="#section-n"` the first click after a page load did nothing at all — no scroll, no
 * hash — and only the second worked, which reads as a broken control and teaches people not
 * to use it. Driving the scroll directly makes the first click behave like every other one,
 * and `replaceState` keeps the address bar honest without pushing history entries nobody
 * wants to walk back through.
 */
export function EditSectionNav({ sections }: { sections: Array<{ step: number; title: string }> }) {
  function jump(event: React.MouseEvent<HTMLAnchorElement>, step: number) {
    const target = document.getElementById(`section-${step}`);
    if (!target) return; // Let the browser try the anchor rather than swallowing the click.
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', `#section-${step}`);
  }

  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="Configuration sections">
      {sections.map((s) => (
        <a
          key={s.step}
          href={`#section-${s.step}`}
          onClick={(e) => jump(e, s.step)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <span className="font-semibold text-primary">{s.step}</span>
          {s.title}
        </a>
      ))}
    </nav>
  );
}

/**
 * Everything that has a defensible default.
 *
 * The page carried ten numbered stages and roughly thirty-five controls, of which someone
 * setting up an experience changes about five. Regrouping the headings would have made that
 * tidier without making it shorter — the cost is the number of decisions on screen, not the
 * number of titles above them. So the decisions stay numbered and visible, and the settings
 * that ship with an answer already in them live behind this.
 *
 * Collapsed by default, and deliberately not persisted: an operator who opens it is doing
 * one specific thing, and a page that remembers being open re-presents the full surface to
 * the next person who arrives for an unrelated reason.
 */
export function EditAdvanced({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="border-border/60 shadow-sm rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-6 py-4 text-left"
        aria-expanded={open}
      >
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
        >
          <ChevronRight className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">Advanced</span>
          <span className="block text-sm text-muted-foreground mt-0.5">
            Turn budget, conversation memory, response format, prompt templates, access and
            telemetry. All have working defaults.
          </span>
        </span>
      </button>
      {open && <CardContent className="space-y-8 pt-0">{children}</CardContent>}
    </Card>
  );
}

/** One labelled group inside {@link EditAdvanced}. */
export function AdvancedGroup({
  title,
  description,
  savesImmediately,
  children,
}: {
  title: string;
  description?: string;
  savesImmediately?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="border-b border-border/50 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          {savesImmediately && (
            <Badge variant="outline" className="gap-1 text-[10px] font-normal">
              <Zap className="size-2.5" />
              Saves as you change it
            </Badge>
          )}
        </div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </div>
      {children}
    </section>
  );
}
