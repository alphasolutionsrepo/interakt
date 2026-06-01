'use client';

// src/app/setup/_components/DocsAssistantCard.tsx
//
// The "Documentation Assistant" section of Initial Setup. It dogfoods Interakt's
// own pipeline over the product docs (see /api/admin/setup-docs). It is gated on
// a system default embedding model existing, auto-builds the first time that
// prerequisite is met, and otherwise offers a manual rebuild. The docs "Read"
// tab in the help drawer works regardless — only this "Ask" capability needs it.

import { BookOpen, Check, Loader2, RefreshCw, AlertTriangle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StepProgress } from '@/components/ui/steps-progress';
import { DOCS_SEED_STEPS, type DocsSeedProgressEvent } from '@/shared/seeders/docs/docs-steps';

interface DocsStatus {
  seeded: boolean;
  seededAt: string | null;
  documents: number | null;
  experienceSlug: string;
  embedding: {
    configured: boolean;
    dimensions: number | null;
    modelKey: string | null;
    dimensionsOk: boolean;
    reason: string | null;
  };
  ready: boolean;
}

export function DocsAssistantCard() {
  const [status, setStatus] = useState<DocsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/admin/setup-docs');
    const json = await res.json().catch(() => null);
    const data = json?.data as DocsStatus | undefined;
    if (data) setStatus(data);
    return data;
  }, []);

  const build = useCallback(
    async (force: boolean) => {
      setBuilding(true);
      setError(null);
      setDoneSteps(new Set());
      try {
        const res = await fetch('/api/admin/setup-docs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'seed', force, stream: true }),
        });
        if (!res.ok || !res.body) throw new Error(`Build failed (HTTP ${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;
            const ev = JSON.parse(payload) as
              | ({ type: 'progress' } & DocsSeedProgressEvent)
              | { type: 'complete' }
              | { type: 'error'; error: string };
            if (ev.type === 'progress' && ev.status === 'done') {
              setDoneSteps((prev) => new Set(prev).add(ev.step));
            } else if (ev.type === 'error') {
              setError(ev.error);
            }
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Build failed');
      } finally {
        setBuilding(false);
        await refresh();
      }
    },
    [refresh],
  );

  // Initial status load.
  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  // While not yet built, poll so the card reacts to a provider being configured
  // elsewhere (e.g. the demo flow on this same page, or another tab) without a
  // manual refresh — important for a fresh setup where the provider is added
  // after this card first mounts.
  useEffect(() => {
    if (loading || building || status?.seeded) return;
    const id = setInterval(() => void refresh(), 4000);
    return () => clearInterval(id);
  }, [loading, building, status?.seeded, refresh]);

  // Auto-build once when the prerequisite is met but the assistant isn't built yet.
  useEffect(() => {
    if (loading || building || autoTried.current) return;
    if (status?.ready && !status.seeded) {
      autoTried.current = true;
      void build(false);
    }
  }, [loading, building, status, build]);

  const currentStep = Math.min(doneSteps.size + 1, DOCS_SEED_STEPS.length);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" /> Documentation Assistant
            {status?.seeded && !building && (
              <Badge variant="secondary" className="gap-1 text-emerald-600">
                <Check className="h-3 w-3" /> Ready
              </Badge>
            )}
          </CardTitle>
          {status?.ready && status.seeded && !building && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => build(true)}>
              <RefreshCw className="h-3.5 w-3.5" /> Rebuild
            </Button>
          )}
        </div>
        <CardDescription>
          Lets users ask “how do I…” questions and get answers grounded in your product docs — powered by
          Interakt&apos;s own chat pipeline. Runs on every deployment; refresh it like any other index when docs change.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking status…
          </p>
        )}

        {/* Prerequisite not met: needs a configured (correctly-sized) embedding model. */}
        {!loading && status && !status.ready && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Waiting on an AI provider</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                {status.embedding.reason ??
                  'A system default embedding model is required to build the assistant.'}
              </p>
              <Link
                href="/ai-providers"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Configure an AI provider <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <p className="text-xs text-muted-foreground">
                The docs “Read” tab in the help drawer works without this — only “Ask” (chat) needs it.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Building. */}
        {building && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Building the assistant — ingesting &amp; embedding docs…
            </p>
            <StepProgress currentStep={currentStep} steps={DOCS_SEED_STEPS.map((s) => s.label)} />
          </div>
        )}

        {/* Ready + built. */}
        {!loading && !building && status?.ready && status.seeded && (
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">{status.documents ?? 0} docs</span> indexed and embedded
              {status.embedding.modelKey ? ` with ${status.embedding.modelKey}` : ''}.
            </p>
            <p>Open the help drawer (the ? in the header) and switch to the <span className="font-medium text-foreground">Ask</span> tab to use it.</p>
          </div>
        )}

        {/* Ready but not yet built (e.g. auto-build hasn't fired). */}
        {!loading && !building && status?.ready && !status.seeded && (
          <Button className="gap-1.5" onClick={() => build(false)}>
            <BookOpen className="h-4 w-4" /> Build the assistant
          </Button>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
