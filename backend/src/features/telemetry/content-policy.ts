// src/features/telemetry/content-policy.ts

/**
 * What traces keep of visitors' words. Only 'full' telemetry keeps content (messages,
 * queries, model output, values taken from them); below it a trace keeps timings,
 * counts, tokens and names.
 *
 * The decision is made when a span starts, while the request's level (admin
 * playgrounds) and the experience are known, and recorded on the span. Steps that
 * don't carry an experience follow their trace, also when they start after the turn
 * itself ended (post-turn work such as memory extraction). The exporter, where every
 * span is written, then drops content from spans that may not keep it, so no code
 * path that sets an attribute can store content by mistake.
 */

import type { Context } from '@opentelemetry/api';
import type { ReadableSpan, Span, SpanProcessor, TimedEvent } from '@opentelemetry/sdk-trace-base';

import { ATTR, CONTENT_ATTRIBUTES, CONTENT_EVENTS } from './attribute-keys';
import { shouldLogContent } from './telemetry.config';

/** How long a trace's decision is kept for steps that start late */
const DECISION_TTL_MS = 10 * 60_000;
/** Bounds memory under heavy traffic; the oldest decisions go first */
const MAX_TRACKED_TRACES = 10_000;

export class ContentPolicyProcessor implements SpanProcessor {
  /** traceId → whether the trace may keep content, and when that was decided */
  private readonly traces = new Map<string, { allowed: boolean; at: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  onStart(span: Span, _parentContext: Context): void {
    const traceId = span.spanContext().traceId;
    const experienceId = span.attributes[ATTR.EXPERIENCE_ID];
    let allowed: boolean;
    if (typeof experienceId === 'string' && experienceId) {
      allowed = shouldLogContent(experienceId);
      this.remember(traceId, allowed);
    } else {
      allowed = this.decided(traceId) ?? shouldLogContent();
    }
    span.setAttribute(ATTR.CONTENT_RECORDED, allowed);
  }

  onEnd(_span: ReadableSpan): void {
    // Decisions outlive the trace's root span: post-turn steps start after it ends
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    this.traces.clear();
    return Promise.resolve();
  }

  private decided(traceId: string): boolean | undefined {
    const entry = this.traces.get(traceId);
    if (!entry) return undefined;
    if (this.now() - entry.at > DECISION_TTL_MS) {
      this.traces.delete(traceId);
      return undefined;
    }
    return entry.allowed;
  }

  private remember(traceId: string, allowed: boolean): void {
    if (this.traces.has(traceId)) return;
    // Insertion order is age order: drop expired decisions, then the oldest if still full
    for (const [id, entry] of this.traces) {
      if (this.now() - entry.at <= DECISION_TTL_MS && this.traces.size < MAX_TRACKED_TRACES) break;
      this.traces.delete(id);
    }
    this.traces.set(traceId, { allowed, at: this.now() });
  }
}

/**
 * A span's attributes and events as they may be stored. Content is kept only when the
 * span was marked to keep it; a span without the mark keeps none (fail closed).
 */
export function storableSpanData(
  attributes: Record<string, unknown>,
  events: TimedEvent[],
): { attributes: Record<string, unknown>; events: TimedEvent[] } {
  if (attributes[ATTR.CONTENT_RECORDED] === true) return { attributes, events };
  return {
    attributes: withoutContentAttributes(attributes),
    events: events
      .filter((event) => !CONTENT_EVENTS.has(event.name))
      .map((event) => ({ ...event, attributes: event.attributes && withoutContentAttributes(event.attributes) })),
  };
}

function withoutContentAttributes<T extends Record<string, unknown>>(attributes: T): T {
  return Object.fromEntries(Object.entries(attributes).filter(([key]) => !CONTENT_ATTRIBUTES.has(key))) as T;
}
