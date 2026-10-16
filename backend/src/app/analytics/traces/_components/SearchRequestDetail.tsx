// app/analytics/traces/_components/SearchRequestDetail.tsx

/**
 * Detail view for search experience traces (search_experience.search /
 * search_experience.summary). These don't run the chat pipeline, so instead of
 * pipeline phases they show what a search or summary actually did: the query,
 * which sources were searched and how each answered, and the model call.
 */

'use client';

import { useState } from 'react';
import { Database, Globe, Sparkles, Binary, ChevronRight, Search, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { SpanDetail, SpanListItem } from '../_lib/api-client';

function attr(span: SpanDetail | undefined, key: string): string | undefined {
  const v = span?.attributes?.[key];
  return v != null && v !== '' ? String(v) : undefined;
}

function fmt(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

const SOURCE_LABELS: Record<string, string> = {
  api: 'Real traffic',
  admin_test: 'Admin test',
  playground: 'Playground',
};

const STEP_META: Record<string, { label: string; icon: React.ElementType; iconClass: string }> = {
  'search.execute': { label: 'Index search', icon: Database, iconClass: 'text-emerald-500' },
  'search.external': { label: 'External index search', icon: Globe, iconClass: 'text-sky-500' },
  'ai.generate_embeddings': { label: 'Query embedding', icon: Binary, iconClass: 'text-violet-500' },
  'ai.stream_chat': { label: 'Summary generation', icon: Sparkles, iconClass: 'text-amber-500' },
  'ai.chat': { label: 'Model call', icon: Sparkles, iconClass: 'text-amber-500' },
};

/** Key facts per step, in display order. */
function stepFacts(span: SpanDetail): Array<[string, string | undefined]> {
  switch (span.operationName) {
    case 'search.execute':
      return [
        ['Index', attr(span, 'alpha.search.index_name')],
        ['Engine', attr(span, 'alpha.search.provider')],
        ['Search type', attr(span, 'alpha.search.type')],
        ['Matches', attr(span, 'alpha.search.total_results')],
        ['Returned', attr(span, 'alpha.search.results_returned')],
        ['Engine time', attr(span, 'alpha.search.es_took_ms') && `${attr(span, 'alpha.search.es_took_ms')}ms`],
        ['Filters', attr(span, 'alpha.search.has_filters') === 'true' ? 'yes' : undefined],
      ];
    case 'search.external':
      return [
        ['Data source', attr(span, 'alpha.data_source.name')],
        ['Engine', attr(span, 'alpha.search.provider')],
        ['Matches', attr(span, 'alpha.search.total_results')],
        ['Returned', attr(span, 'alpha.search.results_returned')],
        ['Engine time', attr(span, 'alpha.search.es_took_ms') && `${attr(span, 'alpha.search.es_took_ms')}ms`],
        ['Filters', attr(span, 'alpha.search.has_filters') === 'true' ? 'yes' : undefined],
      ];
    case 'ai.generate_embeddings':
      return [['Model', attr(span, 'alpha.ai.model_key')]];
    case 'ai.stream_chat':
    case 'ai.chat':
      return [
        ['Model', attr(span, 'alpha.ai.model_key')],
        ['Input tokens', attr(span, 'alpha.ai.input_tokens')],
        ['Output tokens', attr(span, 'alpha.ai.output_tokens')],
        ['First token', attr(span, 'alpha.ai.time_to_first_token_ms') && `${attr(span, 'alpha.ai.time_to_first_token_ms')}ms`],
      ];
    default:
      return [];
  }
}

function StepRow({ span, rootStart, rootDuration }: { span: SpanDetail; rootStart: number; rootDuration: number }) {
  const [open, setOpen] = useState(false);
  const meta = STEP_META[span.operationName] ?? { label: span.operationName, icon: Search, iconClass: 'text-muted-foreground' };
  const Icon = meta.icon;
  const facts = stepFacts(span).filter(([, v]) => v !== undefined) as Array<[string, string]>;
  const prompt = span.events?.find((e) => e.name === 'ai.messages_sent')?.attributes?.messages;
  const response = span.events?.find((e) => e.name === 'ai.response')?.attributes?.text;
  const hasContent = prompt != null || response != null;
  const offset = Math.max(0, new Date(span.startTime).getTime() - rootStart);
  const left = rootDuration > 0 ? (offset / rootDuration) * 100 : 0;
  const width = rootDuration > 0 ? Math.max(1, (span.durationMs / rootDuration) * 100) : 100;

  return (
    <div className="rounded-xl border border-border/60 bg-background">
      <button
        type="button"
        className={cn('w-full px-4 py-3 text-left', hasContent && 'cursor-pointer hover:bg-muted/30')}
        onClick={() => hasContent && setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <Icon className={cn('size-4 shrink-0', meta.iconClass)} />
          <span className="text-sm font-medium">{meta.label}</span>
          {span.statusCode === 'ERROR' && <Badge variant="destructive" className="text-[10px]">Failed</Badge>}
          <span className="ml-auto text-xs font-mono tabular-nums text-muted-foreground">{fmt(span.durationMs)}</span>
          {hasContent && <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-90')} />}
        </div>
        {/* Where this step sits within the request */}
        <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
          <div className="h-1.5 rounded-full bg-primary/40" style={{ marginLeft: `${left}%`, width: `${Math.min(width, 100 - left)}%` }} />
        </div>
        {facts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {facts.map(([k, v]) => (
              <span key={k}>
                {k}: <span className="font-medium text-foreground">{v}</span>
              </span>
            ))}
          </div>
        )}
        {span.statusMessage && span.statusCode === 'ERROR' && (
          <p className="mt-2 text-xs text-destructive">{span.statusMessage}</p>
        )}
      </button>
      {open && hasContent && (
        <div className="space-y-3 border-t border-border/60 px-4 py-3">
          {prompt != null && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Prompt</p>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs">{String(prompt)}</pre>
            </div>
          )}
          {response != null && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Response</p>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs">{String(response)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SearchRequestBody({ rootSpan, spans }: { rootSpan: SpanListItem; spans: SpanDetail[] }) {
  const root = spans.find((s) => s.spanId === rootSpan.spanId);
  const isSummary = rootSpan.operationName === 'search_experience.summary';
  const rootStart = new Date(rootSpan.startTime).getTime();
  const steps = spans
    .filter((s) => s.spanId !== rootSpan.spanId)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const source = attr(root, 'alpha.analytics.source');
  const summaryFacts: Array<[string, string | undefined]> = isSummary
    ? [['Results summarized', attr(root, 'alpha.search.results_returned')]]
    : [
        ['Sources searched', attr(root, 'alpha.search.source_count')],
        ['Matches', attr(root, 'alpha.search.total_results')],
        ['Returned', attr(root, 'alpha.search.results_returned')],
      ];

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-5">
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
          <div className="flex items-center gap-2">
            {isSummary ? <FileText className="size-4 text-amber-500" /> : <Search className="size-4 text-blue-500" />}
            <span className="text-sm font-semibold">{isSummary ? 'AI summary of search results' : 'Search request'}</span>
            {source && <Badge variant="outline" className="ml-auto text-[10px]">{SOURCE_LABELS[source] ?? source}</Badge>}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {summaryFacts.filter(([, v]) => v !== undefined).map(([k, v]) => (
              <span key={k}>
                {k}: <span className="font-medium text-foreground">{v}</span>
              </span>
            ))}
            <span>
              Duration: <span className="font-medium text-foreground">{fmt(rootSpan.durationMs)}</span>
            </span>
          </div>
          {!rootSpan.userMessage && (
            <p className="mt-2 text-xs text-muted-foreground">
              The query is recorded only when the experience&apos;s telemetry level is Full.
            </p>
          )}
        </div>

        {steps.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No steps recorded for this request.</p>
        ) : (
          <div className="space-y-2">
            {steps.map((s) => (
              <StepRow key={s.id} span={s} rootStart={rootStart} rootDuration={rootSpan.durationMs} />
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
