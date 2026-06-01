// src/features/analytics/analytics-processing.service.ts

/**
 * Analytics Processing Service
 *
 * Orchestrates the full analytics processing pipeline:
 * 1. Fetch OTel spans with V2 attributes
 * 2. Intent clustering (embed → cluster → label)
 * 3. Demand signals extraction
 * 4. Catalog health (retry-deduplicated)
 * 5. AI effectiveness metrics
 * 6. Cost analysis
 * 7. Guardrail analytics
 * 8. Proactive insights (anomaly detection)
 *
 * Results are stored in the analytics_insights table for fast retrieval by AI tools.
 */

import 'server-only';

import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { createLogger } from '@/shared/logger/logger';
import { getDateRange, type TimeRange } from './analytics-query.service';
import { clusterIntents, type IntentClusteringResult } from './intent-clustering';
import { detectProactiveInsights } from './proactive-insights.service';
import type { ProcessingStep } from '@/db/analytics-schema/analytics-insights.schema';

const logger = createLogger('analytics-processing');

// ============================================================================
// TYPES
// ============================================================================

export interface ProcessingOptions {
  experienceId?: string;
  timeRanges?: TimeRange[];
  triggeredBy?: string;
}

export interface ProcessingResult {
  runId: string;
  status: 'completed' | 'failed';
  steps: ProcessingStep[];
  durationMs: number;
  error?: string;
}

interface SpanData {
  traceId: string;
  operationName: string;
  durationMs: number;
  statusCode: string;
  experienceId: string | null;
  requestId: string | null;
  attributes: Record<string, unknown>;
}

// ============================================================================
// MAIN PROCESSING PIPELINE
// ============================================================================

export async function runAnalyticsProcessing(
  options: ProcessingOptions = {}
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const timeRanges: TimeRange[] = options.timeRanges || ['24h', '7d', '30d'];
  const steps: ProcessingStep[] = [];

  const { analyticsDB } = await import('@/db/index');
  const { analyticsProcessingRuns, analyticsInsights } = await import(
    '@/db/analytics-schema'
  );

  if (!analyticsDB) {
    return {
      runId: '',
      status: 'failed',
      steps: [],
      durationMs: Date.now() - startTime,
      error: 'Analytics DB not configured',
    };
  }

  // Create processing run record
  const [run] = await analyticsDB
    .insert(analyticsProcessingRuns)
    .values({
      status: 'running',
      experienceId: options.experienceId || null,
      timeRanges,
      steps: [],
      triggeredBy: options.triggeredBy || 'system',
    })
    .returning({ id: analyticsProcessingRuns.id });

  const runId = run.id;

  async function updateRunSteps() {
    await analyticsDB!
      .update(analyticsProcessingRuns)
      .set({ steps })
      .where(eq(analyticsProcessingRuns.id, runId));
  }

  async function upsertInsight(
    insightType: string,
    timeRange: string,
    data: Record<string, unknown>,
    spansProcessed: number,
    durationMs: number
  ) {
    // Upsert by (experienceId, insightType, timeRange)
    const existing = await analyticsDB!
      .select({ id: analyticsInsights.id })
      .from(analyticsInsights)
      .where(
        and(
          options.experienceId
            ? eq(analyticsInsights.experienceId, options.experienceId)
            : sql`${analyticsInsights.experienceId} IS NULL`,
          eq(analyticsInsights.insightType, insightType),
          eq(analyticsInsights.timeRange, timeRange)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await analyticsDB!
        .update(analyticsInsights)
        .set({
          data,
          spansProcessed,
          processedAt: new Date(),
          processingDurationMs: durationMs,
        })
        .where(eq(analyticsInsights.id, existing[0].id));
    } else {
      await analyticsDB!.insert(analyticsInsights).values({
        experienceId: options.experienceId || null,
        insightType,
        timeRange,
        data,
        spansProcessed,
        processedAt: new Date(),
        processingDurationMs: durationMs,
      });
    }
  }

  try {
    for (const timeRange of timeRanges) {
      const range = getDateRange(timeRange);

      // ====================================================================
      // Step 1: Fetch spans
      // ====================================================================
      const fetchStep: ProcessingStep = {
        step: `fetch_spans_${timeRange}`,
        status: 'running',
      };
      steps.push(fetchStep);
      await updateRunSteps();

      const stepStart = Date.now();
      // Fetch pipeline spans (v2.turn + v2.turn_planner — have outcomes, reasoning)
      const allSpans = await fetchSpans(analyticsDB, range, options.experienceId);
      // Filter out playground/admin_test spans — only cluster real API data
      const spans = allSpans.filter(s => {
        const source = getAttrStr(s, 'alpha.analytics.source');
        return !source || source === 'api';
      });
      // Fetch chat spans (have user_message — needed for intent clustering)
      const allChatSpans = await fetchSpansByOperation(analyticsDB!, range, 'chat.ai_experience.turn', options.experienceId);
      const chatSpans = allChatSpans.filter(s => {
        const source = getAttrStr(s, 'alpha.analytics.source');
        return !source || source === 'api';
      });
      // Fetch tool + search spans (have input_params, result_count, search.query)
      const toolSpans = await fetchToolSpans(analyticsDB!, range, options.experienceId);

      fetchStep.count = spans.length + chatSpans.length + toolSpans.length;
      fetchStep.durationMs = Date.now() - stepStart;
      fetchStep.status = 'completed';
      await updateRunSteps();

      logger.info(`Fetched spans for ${timeRange}`, { pipelineSpans: spans.length, chatSpans: chatSpans.length, toolSpans: toolSpans.length });

      if (spans.length === 0 && toolSpans.length === 0) {
        // Store empty results for this time range
        const emptyInsights = [
          'intent_clusters',
          'demand_signals',
          'catalog_health',
          'ai_effectiveness',
          'cost_analysis',
          'guardrail_analytics',
          'proactive_insights',
        ];
        for (const type of emptyInsights) {
          await upsertInsight(type, timeRange, { empty: true, reason: 'no_spans' }, 0, 0);
        }
        continue;
      }

      // ====================================================================
      // Step 2: Intent Clustering
      // ====================================================================
      const clusterStep: ProcessingStep = {
        step: `intent_clusters_${timeRange}`,
        status: 'running',
      };
      steps.push(clusterStep);
      await updateRunSteps();

      const clusterStart = Date.now();
      const clusterResult = await processIntentClusters(spans, chatSpans);
      clusterStep.durationMs = Date.now() - clusterStart;
      clusterStep.count = clusterResult.clusters.length;
      clusterStep.status = 'completed';
      await updateRunSteps();

      await upsertInsight(
        'intent_clusters',
        timeRange,
        clusterResult as unknown as Record<string, unknown>,
        spans.length,
        clusterStep.durationMs
      );

      // ====================================================================
      // Step 3: Demand Signals
      // ====================================================================
      const demandStep: ProcessingStep = {
        step: `demand_signals_${timeRange}`,
        status: 'running',
      };
      steps.push(demandStep);
      await updateRunSteps();

      const demandStart = Date.now();
      const demandResult = processDemandSignals([...spans, ...toolSpans]);
      demandStep.durationMs = Date.now() - demandStart;
      demandStep.status = 'completed';
      await updateRunSteps();

      await upsertInsight(
        'demand_signals',
        timeRange,
        demandResult,
        spans.length,
        demandStep.durationMs
      );

      // ====================================================================
      // Step 4: Catalog Health
      // ====================================================================
      const catalogStep: ProcessingStep = {
        step: `catalog_health_${timeRange}`,
        status: 'running',
      };
      steps.push(catalogStep);
      await updateRunSteps();

      const catalogStart = Date.now();
      const catalogResult = processCatalogHealthFromSpans(toolSpans);
      catalogStep.durationMs = Date.now() - catalogStart;
      catalogStep.status = 'completed';
      await updateRunSteps();

      await upsertInsight(
        'catalog_health',
        timeRange,
        catalogResult,
        spans.length,
        catalogStep.durationMs
      );

      // ====================================================================
      // Step 5: AI Effectiveness
      // ====================================================================
      const effectivenessStep: ProcessingStep = {
        step: `ai_effectiveness_${timeRange}`,
        status: 'running',
      };
      steps.push(effectivenessStep);
      await updateRunSteps();

      const effectivenessStart = Date.now();
      const effectivenessResult = processAIEffectiveness(spans);
      effectivenessStep.durationMs = Date.now() - effectivenessStart;
      effectivenessStep.status = 'completed';
      await updateRunSteps();

      await upsertInsight(
        'ai_effectiveness',
        timeRange,
        effectivenessResult,
        spans.length,
        effectivenessStep.durationMs
      );

      // ====================================================================
      // Step 6: Cost Analysis
      // ====================================================================
      const costStep: ProcessingStep = {
        step: `cost_analysis_${timeRange}`,
        status: 'running',
      };
      steps.push(costStep);
      await updateRunSteps();

      const costStart = Date.now();
      const costResult = processCostAnalysis([...spans, ...toolSpans]);
      costStep.durationMs = Date.now() - costStart;
      costStep.status = 'completed';
      await updateRunSteps();

      await upsertInsight(
        'cost_analysis',
        timeRange,
        costResult,
        spans.length,
        costStep.durationMs
      );

      // ====================================================================
      // Step 7: Guardrail Analytics
      // ====================================================================
      const guardrailStep: ProcessingStep = {
        step: `guardrail_analytics_${timeRange}`,
        status: 'running',
      };
      steps.push(guardrailStep);
      await updateRunSteps();

      const guardrailStart = Date.now();
      // Guardrail data is on pipeline.v2.input_guardrail spans — need to fetch those
      const guardrailSpans = await fetchSpansByOperation(analyticsDB!, range, 'pipeline.v2.input_guardrail', options.experienceId);
      const guardrailResult = processGuardrailAnalytics(guardrailSpans);
      guardrailStep.durationMs = Date.now() - guardrailStart;
      guardrailStep.status = 'completed';
      await updateRunSteps();

      await upsertInsight(
        'guardrail_analytics',
        timeRange,
        guardrailResult,
        spans.length,
        guardrailStep.durationMs
      );

      // ====================================================================
      // Step 8: Proactive Insights
      // ====================================================================
      const proactiveStep: ProcessingStep = {
        step: `proactive_insights_${timeRange}`,
        status: 'running',
      };
      steps.push(proactiveStep);
      await updateRunSteps();

      const proactiveStart = Date.now();
      const proactiveResult = detectProactiveInsights({
        clusters: clusterResult,
        demandSignals: demandResult,
        catalogHealth: catalogResult,
        effectiveness: effectivenessResult,
        costAnalysis: costResult,
        guardrails: guardrailResult,
        timeRange,
      });
      proactiveStep.durationMs = Date.now() - proactiveStart;
      proactiveStep.count = proactiveResult.length;
      proactiveStep.status = 'completed';
      await updateRunSteps();

      await upsertInsight(
        'proactive_insights',
        timeRange,
        { insights: proactiveResult } as unknown as Record<string, unknown>,
        spans.length,
        proactiveStep.durationMs
      );
    }

    // Mark run as completed
    const durationMs = Date.now() - startTime;
    await analyticsDB
      .update(analyticsProcessingRuns)
      .set({
        status: 'completed',
        completedAt: new Date(),
        steps,
      })
      .where(eq(analyticsProcessingRuns.id, runId));

    logger.info('Analytics processing completed', { runId, durationMs });

    return { runId, status: 'completed', steps, durationMs };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logger.error('Analytics processing failed', { runId, error: errorMessage });

    // Mark failed steps
    for (const step of steps) {
      if (step.status === 'running') {
        step.status = 'failed';
        step.error = errorMessage;
      }
    }

    await analyticsDB
      .update(analyticsProcessingRuns)
      .set({
        status: 'failed',
        completedAt: new Date(),
        steps,
        error: errorMessage,
      })
      .where(eq(analyticsProcessingRuns.id, runId));

    return {
      runId,
      status: 'failed',
      steps,
      durationMs: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

// ============================================================================
// PROCESSING STATUS
// ============================================================================

export async function getProcessingStatus(experienceId?: string) {
  const { analyticsDB } = await import('@/db/index');
  const { analyticsProcessingRuns } = await import('@/db/analytics-schema');

  if (!analyticsDB) {
    return { lastRun: null, isStale: true };
  }

  const conditions = experienceId
    ? and(
        eq(analyticsProcessingRuns.experienceId, experienceId),
        eq(analyticsProcessingRuns.status, 'completed')
      )
    : and(
        sql`${analyticsProcessingRuns.experienceId} IS NULL`,
        eq(analyticsProcessingRuns.status, 'completed')
      );

  const [lastRun] = await analyticsDB
    .select()
    .from(analyticsProcessingRuns)
    .where(conditions)
    .orderBy(desc(analyticsProcessingRuns.startedAt))
    .limit(1);

  // Also check for currently running
  const [runningRun] = await analyticsDB
    .select()
    .from(analyticsProcessingRuns)
    .where(eq(analyticsProcessingRuns.status, 'running'))
    .orderBy(desc(analyticsProcessingRuns.startedAt))
    .limit(1);

  const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
  const isStale = !lastRun ||
    Date.now() - new Date(lastRun.completedAt!).getTime() > STALE_THRESHOLD_MS;

  return {
    lastRun: lastRun
      ? {
          id: lastRun.id,
          status: lastRun.status,
          startedAt: lastRun.startedAt,
          completedAt: lastRun.completedAt,
          steps: lastRun.steps,
          timeRanges: lastRun.timeRanges,
        }
      : null,
    currentRun: runningRun
      ? {
          id: runningRun.id,
          status: runningRun.status,
          startedAt: runningRun.startedAt,
          steps: runningRun.steps,
        }
      : null,
    isStale,
  };
}

// ============================================================================
// SPAN FETCHING
// ============================================================================

async function fetchSpans(
  db: NonNullable<typeof import('@/db/index').analyticsDB>,
  range: { from: Date; to: Date },
  experienceId?: string
): Promise<SpanData[]> {
  const { otelSpans } = await import('@/db/analytics-schema');

  // Fetch pipeline.v2.turn spans (these have v2.outcome, v2.preset, token usage)
  // and pipeline.v2.turn_planner spans (these have plan.reasoning)
  // NOT chat.% spans — those are just outer wrappers with no V2 attributes
  const conditions = [
    gte(otelSpans.startTime, range.from),
    lte(otelSpans.startTime, range.to),
    sql`(${otelSpans.operationName} = 'pipeline.v2.turn' OR ${otelSpans.operationName} = 'pipeline.v2.turn_planner')`,
  ];

  if (experienceId) {
    conditions.push(eq(otelSpans.experienceId, experienceId));
  }

  const rows = await db
    .select({
      traceId: otelSpans.traceId,
      operationName: otelSpans.operationName,
      durationMs: otelSpans.durationMs,
      statusCode: otelSpans.statusCode,
      experienceId: otelSpans.experienceId,
      requestId: otelSpans.requestId,
      attributes: otelSpans.attributes,
    })
    .from(otelSpans)
    .where(and(...conditions))
    .orderBy(desc(otelSpans.startTime))
    .limit(5000);

  return rows;
}

// Fetch spans by exact operation name
async function fetchSpansByOperation(
  db: NonNullable<typeof import('@/db/index').analyticsDB>,
  range: { from: Date; to: Date },
  operationName: string,
  experienceId?: string
): Promise<SpanData[]> {
  const { otelSpans } = await import('@/db/analytics-schema');

  const conditions = [
    gte(otelSpans.startTime, range.from),
    lte(otelSpans.startTime, range.to),
    eq(otelSpans.operationName, operationName),
  ];

  if (experienceId) {
    conditions.push(eq(otelSpans.experienceId, experienceId));
  }

  return db
    .select({
      traceId: otelSpans.traceId,
      operationName: otelSpans.operationName,
      durationMs: otelSpans.durationMs,
      statusCode: otelSpans.statusCode,
      experienceId: otelSpans.experienceId,
      requestId: otelSpans.requestId,
      attributes: otelSpans.attributes,
    })
    .from(otelSpans)
    .where(and(...conditions))
    .limit(5000);
}

// Also fetch tool spans for retry analysis and demand signals
async function fetchToolSpans(
  db: NonNullable<typeof import('@/db/index').analyticsDB>,
  range: { from: Date; to: Date },
  experienceId?: string
): Promise<SpanData[]> {
  const { otelSpans } = await import('@/db/analytics-schema');

  // Fetch tool.% AND search.% spans (search spans have alpha.search.query)
  const conditions = [
    gte(otelSpans.startTime, range.from),
    lte(otelSpans.startTime, range.to),
    sql`(${otelSpans.operationName} LIKE 'tool.%' OR ${otelSpans.operationName} LIKE 'search.%')`,
  ];

  if (experienceId) {
    conditions.push(eq(otelSpans.experienceId, experienceId));
  }

  const rows = await db
    .select({
      traceId: otelSpans.traceId,
      operationName: otelSpans.operationName,
      durationMs: otelSpans.durationMs,
      statusCode: otelSpans.statusCode,
      experienceId: otelSpans.experienceId,
      requestId: otelSpans.requestId,
      attributes: otelSpans.attributes,
    })
    .from(otelSpans)
    .where(and(...conditions))
    .orderBy(desc(otelSpans.startTime))
    .limit(10000);

  return rows;
}

// ============================================================================
// PROCESSING FUNCTIONS
// ============================================================================

function getAttr(span: SpanData, key: string): unknown {
  return span.attributes?.[key];
}

function getAttrStr(span: SpanData, key: string): string | undefined {
  const val = getAttr(span, key);
  return typeof val === 'string' ? val : undefined;
}

function getAttrNum(span: SpanData, key: string): number {
  const val = getAttr(span, key);
  return typeof val === 'number' ? val : 0;
}

// --- Intent Clustering ---

async function processIntentClusters(
  pipelineSpans: SpanData[],
  chatSpans: SpanData[]
): Promise<IntentClusteringResult> {
  // plan.reasoning is on pipeline.v2.turn_planner spans
  // v2.outcome is on pipeline.v2.turn spans (same traceId)
  // user_message is on chat.ai_experience.turn spans (same traceId)
  const plannerSpans = pipelineSpans.filter(s => s.operationName === 'pipeline.v2.turn_planner');
  const turnSpans = pipelineSpans.filter(s => s.operationName === 'pipeline.v2.turn');

  // Build traceId → outcome map from turn spans
  const outcomeByTrace = new Map<string, string>();
  for (const s of turnSpans) {
    const outcome = getAttrStr(s, 'alpha.v2.outcome');
    if (outcome) outcomeByTrace.set(s.traceId, outcome);
  }

  // Build traceId → user message map from chat spans
  const userMessageByTrace = new Map<string, string>();
  for (const s of chatSpans) {
    const msg = getAttrStr(s, 'alpha.chat.user_message');
    if (msg) userMessageByTrace.set(s.traceId, msg);
  }

  const entries = plannerSpans
    .filter((s) => getAttrStr(s, 'alpha.v2.plan.reasoning'))
    .map((s) => ({
      reasoning: getAttrStr(s, 'alpha.v2.plan.reasoning')!,
      outcome: outcomeByTrace.get(s.traceId) || 'unknown',
      userMessage: userMessageByTrace.get(s.traceId),
    }));

  return clusterIntents(entries);
}

// --- Demand Signals ---

function processDemandSignals(spans: SpanData[]): Record<string, unknown> {
  const brandCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const queryCounts = new Map<string, number>();

  for (const span of spans) {
    // Extract from tool.input_params (JSON string)
    const inputParamsStr = getAttrStr(span, 'alpha.tool.input_params');
    if (inputParamsStr) {
      try {
        const params = JSON.parse(inputParamsStr);
        if (params.brand) {
          const brand = String(params.brand).toLowerCase();
          brandCounts.set(brand, (brandCounts.get(brand) || 0) + 1);
        }
        if (params.category) {
          const category = String(params.category).toLowerCase();
          categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
        }
      } catch {
        // Skip malformed JSON
      }
    }

    // Extract from search query
    const query = getAttrStr(span, 'alpha.search.query');
    if (query) {
      const normalized = query.toLowerCase().trim();
      queryCounts.set(normalized, (queryCounts.get(normalized) || 0) + 1);
    }
  }

  const sortedBrands = Array.from(brandCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  const sortedCategories = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  const sortedQueries = Array.from(queryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([query, count]) => ({ query, count }));

  return {
    topBrands: sortedBrands,
    topCategories: sortedCategories,
    topQueries: sortedQueries,
    totalSignals: spans.length,
  };
}

// --- Catalog Health ---

function processCatalogHealthFromSpans(
  toolSpans: SpanData[]
): Record<string, unknown> {
  // Group tool spans by traceId to deduplicate retries
  const traceToolGroups = new Map<string, SpanData[]>();
  for (const span of toolSpans) {
    if (!traceToolGroups.has(span.traceId)) {
      traceToolGroups.set(span.traceId, []);
    }
    traceToolGroups.get(span.traceId)!.push(span);
  }

  let apparentZeroResults = 0;
  let realZeroResults = 0;
  let totalSearches = 0;
  let totalDedupedSearches = 0;
  let retryCount = 0;

  for (const [, traceSpans] of traceToolGroups) {
    // Group by tool name within the trace
    const byTool = new Map<string, SpanData[]>();
    for (const span of traceSpans) {
      const toolName = getAttrStr(span, 'alpha.tool.name') || span.operationName;
      if (!byTool.has(toolName)) {
        byTool.set(toolName, []);
      }
      byTool.get(toolName)!.push(span);
    }

    for (const [, toolAttempts] of byTool) {
      // Only count tool.execute spans (not search.execute which are nested)
      const executions = toolAttempts.filter(s => s.operationName === 'tool.execute');
      if (executions.length === 0) continue;

      totalSearches += executions.length;
      totalDedupedSearches++;

      if (executions.length > 1) {
        retryCount += executions.length - 1;
      }

      // Count apparent zero results (every attempt that returned 0)
      for (const attempt of executions) {
        const resultCount = getAttrNum(attempt, 'alpha.tool.result_count');
        if (resultCount === 0) {
          apparentZeroResults++;
        }
      }

      // Real zero result: if NO execution in this group had results > 0
      // (progressive filter relaxation means later attempts may succeed)
      const anySuccess = executions.some(a => getAttrNum(a, 'alpha.tool.result_count') > 0);
      if (!anySuccess) {
        realZeroResults++;
      }
    }
  }

  // Find queries with zero results
  const zeroResultQueries = new Map<string, number>();
  for (const span of toolSpans) {
    const resultCount = getAttrNum(span, 'alpha.tool.result_count');
    const query = getAttrStr(span, 'alpha.search.query');
    if (resultCount === 0 && query) {
      const normalized = query.toLowerCase().trim();
      zeroResultQueries.set(normalized, (zeroResultQueries.get(normalized) || 0) + 1);
    }
  }

  const topZeroResultQueries = Array.from(zeroResultQueries.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([query, count]) => ({ query, count }));

  return {
    apparentZeroResultRate: totalSearches > 0 ? apparentZeroResults / totalSearches : 0,
    realZeroResultRate: totalDedupedSearches > 0 ? realZeroResults / totalDedupedSearches : 0,
    totalSearches,
    totalDedupedSearches,
    retryCount,
    retryRate: totalSearches > 0 ? retryCount / totalSearches : 0,
    apparentZeroResults,
    realZeroResults,
    topZeroResultQueries,
  };
}

// --- AI Effectiveness ---

function processAIEffectiveness(spans: SpanData[]): Record<string, unknown> {
  // Filter to pipeline.v2.turn spans — these have v2.outcome, v2.preset, token usage
  const turnSpans = spans.filter(s => s.operationName === 'pipeline.v2.turn');
  // Turn planner spans have plan.reasoning and direct_response flag
  const plannerSpans = spans.filter(s => s.operationName === 'pipeline.v2.turn_planner');

  const outcomes = { success: 0, plan_failed: 0, context_assembly_failed: 0, unknown: 0 };
  const decisions = { direct_response: 0, tool_call: 0, unknown: 0 };
  const presets = new Map<string, number>();

  for (const span of turnSpans) {
    // Outcomes from pipeline.v2.turn
    const outcome = getAttrStr(span, 'alpha.v2.outcome');
    if (outcome && outcome in outcomes) {
      outcomes[outcome as keyof typeof outcomes]++;
    } else {
      outcomes.unknown++;
    }

    // Presets from pipeline.v2.turn
    const preset = getAttrStr(span, 'alpha.v2.preset');
    if (preset) {
      presets.set(preset, (presets.get(preset) || 0) + 1);
    }
  }

  // Decision types from turn_planner (direct_response vs tool_call)
  for (const span of plannerSpans) {
    const isDirect = getAttrStr(span, 'alpha.v2.plan.direct_response');
    if (isDirect === 'true') {
      decisions.direct_response++;
    } else {
      decisions.tool_call++;
    }
  }

  const total = turnSpans.length;
  const successRate = total > 0 ? outcomes.success / total : 0;
  const retryRate = 0; // Retries are tracked in catalog health

  const presetDistribution = Array.from(presets.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([preset, count]) => ({ preset, count, percentage: total > 0 ? count / total : 0 }));

  return {
    totalConversations: total,
    successRate,
    retryRate,
    outcomes,
    decisions,
    presetDistribution,
    totalRetries: 0,
    conversationsWithRetries: 0,
    avgDurationMs:
      total > 0 ? Math.round(turnSpans.reduce((sum, s) => sum + s.durationMs, 0) / total) : 0,
  };
}

// --- Cost Analysis ---

function processCostAnalysis(spans: SpanData[]): Record<string, unknown> {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTokens = 0;
  const costByTrace = new Map<string, { inputTokens: number; outputTokens: number }>();

  for (const span of spans) {
    const inputTokens = getAttrNum(span, 'alpha.ai.input_tokens');
    const outputTokens = getAttrNum(span, 'alpha.ai.output_tokens');

    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    totalTokens += inputTokens + outputTokens;

    // Per-conversation cost tracking
    if (!costByTrace.has(span.traceId)) {
      costByTrace.set(span.traceId, { inputTokens: 0, outputTokens: 0 });
    }
    const trace = costByTrace.get(span.traceId)!;
    trace.inputTokens += inputTokens;
    trace.outputTokens += outputTokens;
  }

  const conversationCosts = Array.from(costByTrace.values()).map((t) => t.inputTokens + t.outputTokens);
  const avgTokensPerConversation =
    conversationCosts.length > 0
      ? Math.round(conversationCosts.reduce((a, b) => a + b, 0) / conversationCosts.length)
      : 0;
  const maxTokensPerConversation =
    conversationCosts.length > 0 ? Math.max(...conversationCosts) : 0;

  // Retry waste is not calculable from token attributes alone
  // (tool.attempt is always 1, retries_used is 0)
  // The retry cost is better estimated from catalog health data
  const retryTokenWaste = 0;

  return {
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    totalConversations: costByTrace.size,
    avgTokensPerConversation,
    maxTokensPerConversation,
    retryTokenWaste,
    retryWastePercentage: totalTokens > 0 ? retryTokenWaste / totalTokens : 0,
  };
}

// --- Guardrail Analytics ---

function processGuardrailAnalytics(spans: SpanData[]): Record<string, unknown> {
  const classifications = new Map<string, number>();
  const domainSimilarities: number[] = [];
  let blockedCount = 0;
  let shortCircuited = 0;
  let blocklistMatched = 0;

  for (const span of spans) {
    const classification = getAttrStr(span, 'alpha.v2.guardrail.classification');
    if (classification) {
      classifications.set(classification, (classifications.get(classification) || 0) + 1);
      if (classification === 'blocked') {
        blockedCount++;
      }
    }

    const domainSim = getAttrNum(span, 'alpha.v2.guardrail.domain_similarity');
    if (domainSim > 0) {
      domainSimilarities.push(domainSim);
    }

    if (getAttrStr(span, 'alpha.v2.guardrail.short_circuited') === 'true') {
      shortCircuited++;
    }
    if (getAttrStr(span, 'alpha.v2.guardrail.blocklist_matched') === 'true') {
      blocklistMatched++;
    }
  }

  const classificationDistribution = Array.from(classifications.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([classification, count]) => ({
      classification,
      count,
      percentage: spans.length > 0 ? count / spans.length : 0,
    }));

  const avgDomainSimilarity =
    domainSimilarities.length > 0
      ? domainSimilarities.reduce((a, b) => a + b, 0) / domainSimilarities.length
      : 0;

  return {
    totalClassified: Array.from(classifications.values()).reduce((a, b) => a + b, 0),
    classificationDistribution,
    blockedCount,
    blockedRate: spans.length > 0 ? blockedCount / spans.length : 0,
    shortCircuited,
    blocklistMatched,
    avgDomainSimilarity,
    domainSimilarityP50: percentile(domainSimilarities, 50),
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
