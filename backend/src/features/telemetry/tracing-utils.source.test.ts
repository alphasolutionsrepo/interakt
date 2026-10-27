// src/features/telemetry/tracing-utils.source.test.ts

/**
 * A span started inside test traffic (an admin test chat, the playground, a tool's Test panel)
 * carries the source, so reports can leave out its whole trace whatever its entry point.
 */

import { trace } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./telemetry.config', () => ({ isTelemetryEnabled: () => true }));

import { withAnalyticsSource } from '@/features/analytics/analytics-source-context';

import { ATTR } from './attribute-keys';
import { withSpan } from './tracing-utils';

const exporter = new InMemorySpanExporter();
trace.setGlobalTracerProvider(new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }));

const sourceOf = (name: string) => exporter.getFinishedSpans().find((s) => s.name === name)?.attributes[ATTR.ANALYTICS_SOURCE];

describe('span source', () => {
  it('stamps spans started in test traffic, and leaves live ones and explicit sources alone', async () => {
    await withAnalyticsSource('admin_test', () => withSpan({ name: 'tool.execute' }, async () => 'ok'));
    await withSpan({ name: 'live' }, async () => 'ok');
    await withAnalyticsSource('admin_test', () =>
      withSpan({ name: 'explicit', attributes: { [ATTR.ANALYTICS_SOURCE]: 'playground' } }, async () => 'ok'));

    expect(sourceOf('tool.execute')).toBe('admin_test');
    expect(sourceOf('live')).toBeUndefined();
    expect(sourceOf('explicit')).toBe('playground');
  });
});
