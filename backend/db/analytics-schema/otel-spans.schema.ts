// db/analytics-schema/otel-spans.schema.ts

/**
 * OpenTelemetry Spans Table
 *
 * Stores spans exported by the PostgresSpanExporter.
 * Denormalized top-level columns enable fast querying without JSONB extraction.
 * Full attribute/event payloads stored as JSONB for flexibility.
 */

import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  integer,
  text,
  index,
} from 'drizzle-orm/pg-core';

export const otelSpans = pgTable(
  'otel_spans',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    traceId: varchar('trace_id', { length: 32 }).notNull(),
    spanId: varchar('span_id', { length: 16 }).notNull(),
    parentSpanId: varchar('parent_span_id', { length: 16 }),
    operationName: varchar('operation_name', { length: 255 }).notNull(),
    serviceName: varchar('service_name', { length: 100 }).notNull(),
    spanKind: varchar('span_kind', { length: 20 }).notNull().default('INTERNAL'),

    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }).notNull(),
    durationMs: integer('duration_ms').notNull(),

    statusCode: varchar('status_code', { length: 10 }).notNull().default('UNSET'),
    statusMessage: text('status_message'),

    // Denormalized for fast querying (extracted from attributes during export)
    experienceId: uuid('experience_id'),
    experienceType: varchar('experience_type', { length: 20 }),
    pipelineType: varchar('pipeline_type', { length: 30 }),
    requestId: uuid('request_id'),
    sessionId: varchar('session_id', { length: 255 }),

    // Full attribute payload
    attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),

    // Events (exceptions, annotations)
    events: jsonb('events')
      .$type<
        Array<{
          name: string;
          timestamp: string;
          attributes: Record<string, unknown>;
        }>
      >()
      .notNull()
      .default([]),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_otel_spans_trace_id').on(table.traceId),
    index('idx_otel_spans_parent').on(table.parentSpanId),
    index('idx_otel_spans_operation').on(table.operationName),
    index('idx_otel_spans_start_time').on(table.startTime),
    index('idx_otel_spans_experience').on(table.experienceId),
    index('idx_otel_spans_experience_type').on(table.experienceType),
    index('idx_otel_spans_pipeline').on(table.pipelineType),
    index('idx_otel_spans_request').on(table.requestId),
    index('idx_otel_spans_status').on(table.statusCode),
    index('idx_otel_spans_duration').on(table.durationMs),
    // Composite: trace reconstruction
    index('idx_otel_spans_trace_start').on(table.traceId, table.startTime),
    // Composite: experience dashboard queries
    index('idx_otel_spans_exp_time').on(table.experienceId, table.startTime),
  ]
);
