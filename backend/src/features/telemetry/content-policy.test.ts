// src/features/telemetry/content-policy.test.ts

/**
 * Traces keep visitors' words only at 'full' telemetry. Runs the real OTel SDK with
 * the content policy and the real Postgres span exporter, as telemetry.init wires
 * them; only the database insert is captured.
 */

import { context, trace } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { operationName: string; attributes: Record<string, unknown>; events: Array<{ name: string; attributes: Record<string, unknown> }> };
const rows = vi.hoisted(() => [] as Row[]);
vi.mock('@/db/index', () => ({
  analyticsDB: { insert: () => ({ values: async (values: Row[]) => { rows.push(...values); } }) },
}));

import { ATTR } from './attribute-keys';
import { ContentPolicyProcessor } from './content-policy';
import { PostgresSpanExporter } from './postgres-span-exporter';
import {
  clearAllTelemetryOverrides,
  initializeTelemetryConfig,
  runWithTelemetryLevel,
  setExperienceTelemetryOverride,
} from './telemetry.config';

// Must match GLOBAL_CONFIG_KEY in telemetry.config.ts
const GLOBAL_CONFIG_KEY = '__alpha_telemetry_config__';

// Batched as in production: one export per flush, so the mocked database is imported once
const provider = new BasicTracerProvider({
  spanProcessors: [new ContentPolicyProcessor(), new BatchSpanProcessor(new PostgresSpanExporter())],
});
const tracer = provider.getTracer('content-policy-test');

const MESSAGE = 'where is my order 48213? I am Jane Doe';

/** A chat turn shaped like the real one: the turn carries the experience, a step doesn't. */
async function chatTurn(experienceId: string): Promise<Row[]> {
  const turn = tracer.startSpan('chat.ai_experience.turn', {
    attributes: { [ATTR.EXPERIENCE_ID]: experienceId, [ATTR.CHAT_USER_MESSAGE]: MESSAGE },
  });
  const step = tracer.startSpan('pipeline.v2.response_synthesis', {}, trace.setSpan(context.active(), turn));
  step.setAttribute('alpha.v2.response_text', 'Your order 48213 ships tomorrow, Jane.');
  step.setAttribute('alpha.v2.step.query', 'order 48213');
  step.setAttribute(ATTR.AI_MODEL_KEY, 'qwen2.5:14b');
  step.setAttribute(ATTR.AI_TOTAL_TOKENS, 321);
  step.addEvent('ai.response', { text: 'Your order 48213 ships tomorrow, Jane.' });
  step.addEvent('execution.tool_execution', { 'alpha.v2.action_step.detail': 'order 48213', 'alpha.v2.action_step.duration_ms': 40 });
  step.end();
  turn.end();
  await provider.forceFlush();
  return rows;
}

const row = (name: string) => rows.find((r) => r.operationName === name)!;
const anyText = () => JSON.stringify(rows).match(/48213|Jane/g) ?? [];

beforeAll(() => {
  process.env.ENABLE_OTEL = 'true';
  delete (globalThis as Record<string, unknown>)[GLOBAL_CONFIG_KEY];
  initializeTelemetryConfig().enabled = true;
  setExperienceTelemetryOverride('exp-metadata', 'metadata');
  setExperienceTelemetryOverride('exp-full', 'full');
});
beforeEach(() => {
  rows.length = 0;
});
afterAll(() => clearAllTelemetryOverrides());

describe('what a stored trace keeps of the visitor\'s words', () => {
  it('keeps none at "Metadata only", on the turn and on steps that inherit it', async () => {
    await chatTurn('exp-metadata');

    expect(anyText()).toEqual([]);
    const step = row('pipeline.v2.response_synthesis');
    // Metadata stays: model, tokens, step timings
    expect(step.attributes).toMatchObject({ [ATTR.AI_MODEL_KEY]: 'qwen2.5:14b', [ATTR.AI_TOTAL_TOKENS]: 321 });
    expect(step.events.map((e) => e.name)).toEqual(['execution.tool_execution']);
    expect(step.events[0].attributes).toEqual({ 'alpha.v2.action_step.duration_ms': 40 });
  });

  it('keeps everything at "Full"', async () => {
    await chatTurn('exp-full');

    expect(row('chat.ai_experience.turn').attributes[ATTR.CHAT_USER_MESSAGE]).toBe(MESSAGE);
    expect(row('pipeline.v2.response_synthesis').events.map((e) => e.name)).toEqual(['ai.response', 'execution.tool_execution']);
  });

  it('keeps everything when an admin asks for a full trace of a "Metadata only" experience', async () => {
    await runWithTelemetryLevel('full', () => chatTurn('exp-metadata'));

    expect(row('chat.ai_experience.turn').attributes[ATTR.CHAT_USER_MESSAGE]).toBe(MESSAGE);
  });

  it('follows the trace for a step that starts after the turn ended (post-turn work)', async () => {
    const turn = tracer.startSpan('chat.ai_experience.turn', { attributes: { [ATTR.EXPERIENCE_ID]: 'exp-full' } });
    const turnContext = trace.setSpan(context.active(), turn);
    turn.end();
    const late = tracer.startSpan('pipeline.v2.memory_extraction', {}, turnContext);
    late.setAttribute(ATTR.CHAT_USER_MESSAGE, MESSAGE);
    late.end();
    await provider.forceFlush();

    expect(row('pipeline.v2.memory_extraction').attributes[ATTR.CHAT_USER_MESSAGE]).toBe(MESSAGE);
  });

  it('still leaves out library spans (the mark alone does not make a span ours)', async () => {
    const library = tracer.startSpan('search', { attributes: { 'db.system': 'elasticsearch' } });
    library.end();
    await provider.forceFlush();

    expect(rows).toEqual([]);
  });

  it('keeps none from a span that was never marked (no content policy in front)', async () => {
    const unmarked = new BasicTracerProvider({ spanProcessors: [new BatchSpanProcessor(new PostgresSpanExporter())] });
    unmarked.getTracer('unmarked').startSpan('chat.ai_experience.turn', {
      attributes: { [ATTR.CHAT_USER_MESSAGE]: MESSAGE, [ATTR.AI_TOTAL_TOKENS]: 5 },
    }).end();
    await unmarked.forceFlush();

    expect(row('chat.ai_experience.turn').attributes).toEqual({ [ATTR.AI_TOTAL_TOKENS]: 5 });
  });
});

describe('how long a trace\'s decision is kept', () => {
  it('forgets it after ten minutes, keeping no content for later steps', () => {
    let now = 0;
    const exported = new InMemorySpanExporter();
    const local = new BasicTracerProvider({
      spanProcessors: [new ContentPolicyProcessor(() => now), new SimpleSpanProcessor(exported)],
    }).getTracer('ttl');
    const turn = local.startSpan('chat.ai_experience.turn', { attributes: { [ATTR.EXPERIENCE_ID]: 'exp-full' } });
    const turnContext = trace.setSpan(context.active(), turn);
    turn.end();

    now = 10 * 60_000;
    local.startSpan('in-time', {}, turnContext).end();
    now = 10 * 60_000 + 1;
    local.startSpan('too-late', {}, turnContext).end();

    const marks = Object.fromEntries(exported.getFinishedSpans().map((s) => [s.name, s.attributes[ATTR.CONTENT_RECORDED]]));
    expect(marks).toMatchObject({ 'in-time': true, 'too-late': false });
  });
});
