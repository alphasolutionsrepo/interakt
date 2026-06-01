'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import type { SpanDetail } from '../_lib/api-client';
import { useTraceSpans } from '../_lib/hooks/useTraces';

interface TraceWaterfallProps {
  traceId: string | null;
  selectedSpanId: string | null;
  onSelectSpan: (span: SpanDetail) => void;
  onClose: () => void;
  showHeader?: boolean;
}

interface SpanNode {
  span: SpanDetail;
  children: SpanNode[];
  depth: number;
}

function humanizeOpName(name: string): string {
  const labels: Record<string, string> = {
    'chat.ai_experience.turn': 'AI Experience Turn',
    'chat.search_experience.turn': 'Search Experience Turn',
    'chat.deterministic.turn': 'Deterministic Turn',
    'ai.chat': 'AI Chat',
    'ai.stream_chat': 'AI Chat (Stream)',
    'ai.generate_text': 'AI Text Generation',
    'ai.generate_embeddings': 'AI Embeddings',
    'search.execute': 'Search',
    'tool.execute': 'Tool Execution',
  };
  if (name in labels) return labels[name];
  if (name.startsWith('pipeline.')) return `Phase: ${name.slice(9)}`;
  return name;
}

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function buildTree(spans: SpanDetail[]): SpanNode[] {
  const map = new Map<string, SpanNode>();
  const roots: SpanNode[] = [];

  // Create nodes
  for (const span of spans) {
    map.set(span.spanId, { span, children: [], depth: 0 });
  }

  // Build hierarchy
  for (const span of spans) {
    const node = map.get(span.spanId)!;
    if (span.parentSpanId && map.has(span.parentSpanId)) {
      const parent = map.get(span.parentSpanId)!;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Assign depths
  function setDepth(node: SpanNode, depth: number) {
    node.depth = depth;
    // Sort children by start time
    node.children.sort(
      (a, b) => new Date(a.span.startTime).getTime() - new Date(b.span.startTime).getTime(),
    );
    for (const child of node.children) {
      setDepth(child, depth + 1);
    }
  }

  roots.sort(
    (a, b) => new Date(a.span.startTime).getTime() - new Date(b.span.startTime).getTime(),
  );
  for (const root of roots) {
    setDepth(root, 0);
  }

  return roots;
}

function flattenTree(nodes: SpanNode[]): SpanNode[] {
  const result: SpanNode[] = [];
  function walk(node: SpanNode) {
    result.push(node);
    for (const child of node.children) {
      walk(child);
    }
  }
  for (const root of nodes) {
    walk(root);
  }
  return result;
}

function WaterfallRow({
  node,
  traceStartMs,
  traceDurationMs,
  isSelected,
  onSelect,
}: {
  node: SpanNode;
  traceStartMs: number;
  traceDurationMs: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { span, depth } = node;
  const isError = span.statusCode === 'ERROR';

  const spanStartMs = new Date(span.startTime).getTime();
  const offsetPct = traceDurationMs > 0 ? ((spanStartMs - traceStartMs) / traceDurationMs) * 100 : 0;
  const widthPct = traceDurationMs > 0 ? (span.durationMs / traceDurationMs) * 100 : 100;
  const clampedWidth = Math.max(widthPct, 0.5); // min visible width

  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-accent/50',
        isSelected && 'bg-accent',
      )}
      onClick={onSelect}
    >
      {/* Label section */}
      <div
        className="shrink-0 min-w-0"
        style={{ width: '240px', paddingLeft: `${depth * 16}px` }}
      >
        <span className="block truncate text-xs font-medium" title={span.operationName}>
          {humanizeOpName(span.operationName)}
        </span>
        <span className="block text-[10px] text-muted-foreground tabular-nums">
          {formatDuration(span.durationMs)}
        </span>
      </div>

      {/* Waterfall bar */}
      <div className="relative h-6 flex-1 min-w-0">
        <div className="absolute inset-0 rounded-sm bg-muted/30" />
        <div
          className={cn(
            'absolute top-0.5 bottom-0.5 rounded-sm transition-colors',
            isError ? 'bg-red-500/80' : 'bg-green-500/70',
            isSelected && (isError ? 'bg-red-500' : 'bg-green-500'),
          )}
          style={{
            left: `${Math.min(offsetPct, 99)}%`,
            width: `${Math.min(clampedWidth, 100 - offsetPct)}%`,
          }}
        />
      </div>
    </button>
  );
}

export function TraceWaterfall({ traceId, selectedSpanId, onSelectSpan, onClose, showHeader = true }: TraceWaterfallProps) {
  const { data: spans, isLoading, error } = useTraceSpans(traceId);

  const { tree, flatNodes, traceStartMs, traceDurationMs } = useMemo(() => {
    if (!spans || spans.length === 0) {
      return { tree: [], flatNodes: [], traceStartMs: 0, traceDurationMs: 0 };
    }

    const t = buildTree(spans);
    const flat = flattenTree(t);

    const startTimes = spans.map((s) => new Date(s.startTime).getTime());
    const endTimes = spans.map((s) => new Date(s.endTime).getTime());
    const trStart = Math.min(...startTimes);
    const trEnd = Math.max(...endTimes);

    return {
      tree: t,
      flatNodes: flat,
      traceStartMs: trStart,
      traceDurationMs: Math.max(trEnd - trStart, 1),
    };
  }, [spans]);

  if (!traceId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a trace to view the waterfall.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="size-7" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (error || !spans) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <p>Failed to load trace.</p>
        <p className="text-xs text-destructive">{error?.message}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Trace Waterfall</h3>
              <Badge variant="secondary" className="text-[10px]">
                {flatNodes.length} span{flatNodes.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground" title={traceId}>
              {traceId}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      )}

      {/* Timeline header */}
      <div className="flex items-center gap-2 border-b px-2 py-1 text-[10px] text-muted-foreground">
        <div className="w-[240px] shrink-0 pl-2">Operation</div>
        <div className="flex flex-1 justify-between">
          <span>0ms</span>
          <span>{formatDuration(traceDurationMs / 4)}</span>
          <span>{formatDuration(traceDurationMs / 2)}</span>
          <span>{formatDuration((traceDurationMs * 3) / 4)}</span>
          <span>{formatDuration(traceDurationMs)}</span>
        </div>
      </div>

      {/* Span rows */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="p-1">
          {flatNodes.map((node) => (
            <WaterfallRow
              key={node.span.id}
              node={node}
              traceStartMs={traceStartMs}
              traceDurationMs={traceDurationMs}
              isSelected={node.span.id === selectedSpanId}
              onSelect={() => onSelectSpan(node.span)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
