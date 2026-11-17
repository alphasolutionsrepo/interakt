// src/features/search-experience/query-interpreter.ts

/**
 * Query Interpreter
 *
 * Natural-language understanding for the search box: parses a typed phrase into a
 * cleaned query plus structured filters before the search runs.
 *
 * The search path has no filter extraction of its own — filters arrive only from
 * the request body, set by facet UI. So a shopper typing "men's t-shirts below
 * $110" gets those words matched as text and no price filtering whatsoever. This
 * closes that gap for experiences that opt in.
 *
 * Two properties are deliberate:
 *
 * - **Fail-open.** Any failure — model error, bad JSON, missing config — returns
 *   the original query unchanged. A broken interpreter must degrade to ordinary
 *   search, never break it.
 * - **Cached with single-flight.** An LLM call on every keystroke would be slow and
 *   expensive; CacheManager.getOrSet collapses concurrent identical queries into
 *   one call.
 * - **Time-limited.** Each step has the experience's time limit; past it search goes on
 *   with what the visitor sent. The shared model call is cut off at the longest limit (10 s).
 *
 * Managed indexes get filters (interpretQuery); external sources, which expose no
 * fields to filter on, get the question rewritten into search terms
 * (rewriteQueryForExternalSearch).
 */

import 'server-only';

import { createHash } from 'node:crypto';

import { constraintCache, interpretationCache, rewriteCache } from './query-interpreter.cache';
import {
    INTERPRETER_SCHEMA,
    buildInterpreterPrompt,
    parseInterpretation,
    shouldInterpret,
    toParameterContext,
    type InterpretedFilter,
} from './query-interpreter.core';
import { REWRITE_SCHEMA, buildRewritePrompt, parseRewrite, shouldRewrite } from './query-rewriter.core';
import { DEFAULT_QUERY_UNDERSTANDING_TIMEOUT_MS, MAX_QUERY_UNDERSTANDING_TIMEOUT_MS } from './search-experience.types';

import type {
    SearchExperienceAIConfig,
    SearchExperienceQueryUnderstandingConfig,
} from '@/db/schema/search-experience.schema';
import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';
import * as aiService from '@/features/ai-service';
import { validateFilters } from '@/features/pipeline/v2/param-validation';
import type { FieldConstraint } from '@/features/pipeline/v2/parameter-context.types';
import * as searchService from '@/features/search/search.service';
import * as searchIndexService from '@/features/search-index/search-index.service';
import { EMBEDDING_FIELD_NAME } from '@/shared/constants/embedding.constants';
import { failureLevel } from '@/shared/errors/to-app-error';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('query-interpreter');

/** How many distinct values to offer the model per text field. */
const MAX_FACET_VALUES = 40;

// ============================================================================
// TYPES
// ============================================================================

export interface QueryInterpretation {
    /** What the user typed */
    originalQuery: string;
    /** What should actually be searched for */
    effectiveQuery: string;
    /** Filters to apply alongside the query */
    appliedFilters: InterpretedFilter[];
    /** Filters the model proposed that the index could not honour */
    droppedFilters: Array<{ field: string; reason: string }>;
    /** False when interpretation was skipped or failed — effectiveQuery is then the original */
    interpreted: boolean;
    /** How the step ended, for the trace: a failed or timed-out step searched with the visitor's words */
    outcome: QueryInterpretationOutcome;
    durationMs: number;
}

export type QueryInterpretationOutcome = 'interpreted' | 'skipped' | 'failed' | 'timed_out';

function passthrough(query: string, startedAt: number, outcome: Exclude<QueryInterpretationOutcome, 'interpreted'>): QueryInterpretation {
    return {
        originalQuery: query,
        effectiveQuery: query,
        appliedFilters: [],
        droppedFilters: [],
        interpreted: false,
        outcome,
        durationMs: Date.now() - startedAt,
    };
}

// ============================================================================
// TIME LIMIT
// ============================================================================

/** A query understanding step ran past its time limit. */
export class QueryStepTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`Query understanding took longer than ${timeoutMs} ms`);
        this.name = 'QueryStepTimeoutError';
    }
}

/** The experience's time limit, or the default for experiences saved before it existed. */
export function resolveTimeoutMs(config?: SearchExperienceQueryUnderstandingConfig): number {
    return config?.timeoutMs ?? DEFAULT_QUERY_UNDERSTANDING_TIMEOUT_MS;
}

/**
 * Run a step with this caller's own time limit. Past it, this rejects with
 * QueryStepTimeoutError at once. It never aborts anything: a model call shared through
 * the cache keeps running for the other callers that joined it.
 */
async function withTimeLimit<T>(timeoutMs: number, run: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new QueryStepTimeoutError(timeoutMs)), timeoutMs);
    });
    try {
        return await Promise.race([run(), limit]);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Start a model call that callers share through the cache. It is owned by the cache
 * entry, not by whoever started it: its signal aborts only at the longest limit any
 * experience can set, so a hung provider cannot hold the cache key forever. It settles
 * then even if the provider ignores the signal, which keeps the failure out of the cache.
 */
function startSharedCall<T>(start: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const backstop = setTimeout(
        () => controller.abort(new QueryStepTimeoutError(MAX_QUERY_UNDERSTANDING_TIMEOUT_MS)),
        MAX_QUERY_UNDERSTANDING_TIMEOUT_MS,
    );
    return settleOnAbort(controller.signal, start(controller.signal)).finally(() => clearTimeout(backstop));
}

/**
 * Settle when the signal aborts, even if the provider ignores it.
 */
function settleOnAbort<T>(signal: AbortSignal, work: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(signal.reason);
        if (signal.aborted) {
            onAbort();
            return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
        work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
}

// One import shared by both steps, which run side by side: vitest hands the second of two
// concurrent dynamic imports the real module instead of its mock.
let featureSwitches: Promise<typeof import('@/features/feature-switches/feature-switches.service')> | undefined;

/** Whether AI summaries, which query understanding is part of, is on. */
async function summariesAreaOn(): Promise<boolean> {
    featureSwitches ??= import('@/features/feature-switches/feature-switches.service');
    const { isAreaOn } = await featureSwitches;
    return isAreaOn('ai-summaries');
}

/** The text of a completion; only text can carry the JSON we asked for. */
function completionText(completion: Awaited<ReturnType<typeof aiService.chat>>): string {
    const rawContent = completion.message?.content;
    return typeof rawContent === 'string'
        ? rawContent
        : (rawContent ?? [])
            .map(block => (typeof block === 'object' && block !== null && 'text' in block
                ? String((block as { text?: unknown }).text ?? '')
                : ''))
            .join('');
}

// ============================================================================
// FIELD CONSTRAINTS
// ============================================================================

/** Map an index field's declared type onto the coarse types the prompt uses. */
function normalizeFieldType(fieldType: string): FieldConstraint['fieldType'] {
    switch (fieldType) {
        case 'number':
            return 'number';
        case 'boolean':
            return 'boolean';
        case 'date':
        case 'datetime':
            return 'date';
        default:
            return 'text';
    }
}

/**
 * Fetch the distinct values of a facetable text field.
 *
 * Grounding the model in real values is what turns "mens" into the index's actual
 * "Men" — without it the filter matches nothing and looks broken.
 */
async function fetchFacetValues(searchIndexId: string, field: string): Promise<string[]> {
    try {
        // Query understanding loads the field's values before asking the AI: a fixed AI step, not a
        // visitor search, so search reports don't count it.
        const response = await searchService.searchById(searchIndexId, {
            query: '*',
            searchType: 'lexical',
            pageSize: 1,
            facets: [{
                field,
                type: 'terms',
                size: MAX_FACET_VALUES,
                orderBy: 'count',
                orderDirection: 'desc',
            }],
        }, { triggerType: 'ai_step', triggerStep: 'query_interpretation' });
        return response.facets?.find(f => f.field === field)?.buckets.map(b => String(b.key)) ?? [];
    } catch (err) {
        // A field whose values cannot be listed is still filterable; the model just
        // loses the vocabulary hint for it. The search service passes the failure on, so
        // this is its line: an error when the engine failed, so the outage still shows
        logger[failureLevel(err, 'warn')]('Failed to fetch facet values', { searchIndexId, field, err });
        return [];
    }
}

/**
 * Build the filterable-field map for an index.
 *
 * `isIndexed` is what makes a field filterable at query time — that is the check
 * the filter builder itself applies — while `isFacetable` decides whether its
 * values can be enumerated for the prompt.
 */
async function loadFieldConstraints(
    searchIndexId: string,
): Promise<Record<string, FieldConstraint>> {
    const cached = await constraintCache.get<Record<string, FieldConstraint>>(searchIndexId);
    if (cached) {
        return cached;
    }

    const index = await searchIndexService.getSearchIndexById(searchIndexId);
    if (!index) {
        return {};
    }

    const filterable = index.fields.filter(
        (f: SearchIndexField) => f.isIndexed && f.fieldName !== EMBEDDING_FIELD_NAME,
    );

    const constraints: Record<string, FieldConstraint> = {};

    await Promise.all(filterable.map(async (field: SearchIndexField) => {
        const fieldType = normalizeFieldType(field.fieldType);
        const canEnumerate = field.isFacetable && fieldType === 'text';

        constraints[field.fieldName] = {
            fieldName: field.fieldName,
            fieldType,
            isFilterable: true,
            isFacetable: field.isFacetable,
            validValues: canEnumerate ? await fetchFacetValues(searchIndexId, field.fieldName) : [],
        };
    }));

    await constraintCache.set(searchIndexId, constraints);
    return constraints;
}

/**
 * Short, stable digest of a value that feeds the interpreter prompt, for use in the
 * cache key. Instructions can run to 5000 characters, so they are hashed rather than
 * embedded — this only has to distinguish versions, not resist attack.
 */
function fingerprint(value: string | undefined): string {
    if (!value) return 'none';
    return createHash('sha1').update(value).digest('hex').slice(0, 12);
}

/**
 * Drop everything cached for an index after its configuration changes.
 * Re-exported from the cache module so callers have one obvious place to reach for.
 */
export { invalidateQueryInterpreterCache } from './query-interpreter.cache';

/**
 * Interpret a request's query and fold the result into its filters.
 *
 * Shared by both search entry points — the public token route and the slug route —
 * so a phrase behaves identically wherever it is typed.
 *
 * Client-supplied filters win: those come from facet UI the user clicked
 * deliberately, and an inferred filter must never override an explicit choice. An
 * interpreted filter is only added for a field the request does not already
 * constrain.
 */
export async function applyQueryInterpretation(options: {
    query: string;
    clientFilters: Array<{ field: string; operator: string; value: unknown }> | undefined;
    searchIndexId: string | undefined;
    /**
     * The experience's whole AI config, not just the nested queryUnderstanding
     * block: interpretation is an AI feature, so the global switch has to gate it
     * the way it gates summaries. Taking the parent object means a caller cannot
     * hand over the nested flag while omitting the global one.
     */
    aiConfig?: SearchExperienceAIConfig;
    experienceId?: string;
}): Promise<{
    query: string;
    filters: Array<{ field: string; operator: string; value: unknown }> | undefined;
    interpretation?: QueryInterpretation;
}> {
    const { query, clientFilters, searchIndexId, aiConfig } = options;

    if (!searchIndexId || !aiConfig?.enabled || !aiConfig.queryUnderstanding?.enabled) {
        return { query, filters: clientFilters };
    }

    // Query understanding is part of AI summaries: with that off, search runs as plain search
    if (!(await summariesAreaOn())) {
        return { query, filters: clientFilters };
    }

    const interpretation = await interpretQuery({
        query,
        searchIndexId,
        config: aiConfig.queryUnderstanding,
        providerId: aiConfig.providerId,
        modelId: aiConfig.modelId,
        experienceId: options.experienceId,
    });

    if (!interpretation.interpreted) {
        return { query, filters: clientFilters, interpretation };
    }

    const clientFields = new Set((clientFilters ?? []).map(f => f.field));
    const additions = interpretation.appliedFilters.filter(f => !clientFields.has(f.field));
    const merged = [...(clientFilters ?? []), ...additions];

    return {
        query: interpretation.effectiveQuery,
        filters: merged.length > 0 ? merged : undefined,
        interpretation: { ...interpretation, appliedFilters: additions },
    };
}

// ============================================================================
// INTERPRETATION
// ============================================================================

export interface InterpretQueryOptions {
    query: string;
    searchIndexId: string;
    config?: SearchExperienceQueryUnderstandingConfig;
    /** Provider/model from the experience's aiConfig; null means system default. */
    providerId?: string | null;
    modelId?: number | null;
    /** For per-experience telemetry detail */
    experienceId?: string;
}

/**
 * Interpret a search phrase into a query plus filters.
 *
 * Never throws: every failure path returns the original query untouched.
 */
export async function interpretQuery(
    options: InterpretQueryOptions,
): Promise<QueryInterpretation> {
    const startedAt = Date.now();
    const { query, searchIndexId, config } = options;

    if (!config?.enabled) {
        return passthrough(query, startedAt, 'skipped');
    }
    if (!shouldInterpret(query, config.minWords ?? 3)) {
        return passthrough(query, startedAt, 'skipped');
    }

    const timeoutMs = resolveTimeoutMs(config);
    try {
        // Field loading counts toward the limit too: the search waits for all of it
        const result = await withTimeLimit(timeoutMs, () => interpretWithModel(options, config));

        if (result === NO_FILTERABLE_FIELDS) {
            return passthrough(query, startedAt, 'skipped');
        }
        if (!result) {
            return passthrough(query, startedAt, 'failed');
        }

        logger.info('Query interpreted', {
            searchIndexId,
            originalQuery: query,
            effectiveQuery: result.effectiveQuery,
            filters: result.appliedFilters.map(f => `${f.field}${f.operator}${String(f.value)}`),
            dropped: result.droppedFilters.length,
            durationMs: Date.now() - startedAt,
        });

        return { ...result, durationMs: Date.now() - startedAt };
    } catch (err) {
        if (err instanceof QueryStepTimeoutError) {
            logger.warn('Query interpretation timed out; searching with the raw query', { searchIndexId, timeoutMs });
            return passthrough(query, startedAt, 'timed_out');
        }
        // Fail open — a search that returns loose results beats one that errors. A model
        // that is down or misconfigured still needs fixing, so it is logged as an error.
        logger[failureLevel(err, 'warn')]('Query interpretation failed; searching with the raw query', { searchIndexId, err });
        return passthrough(query, startedAt, 'failed');
    }
}

/** The index has no fields to filter on, so there is nothing to ask the model. */
const NO_FILTERABLE_FIELDS = Symbol('no filterable fields');

/** Load the index's fields and ask the model; null when the model gave nothing usable. */
async function interpretWithModel(
    options: InterpretQueryOptions,
    config: SearchExperienceQueryUnderstandingConfig,
): Promise<QueryInterpretation | null | typeof NO_FILTERABLE_FIELDS> {
    const { query, searchIndexId } = options;
    const constraints = await loadFieldConstraints(searchIndexId);
    if (Object.keys(constraints).length === 0) {
        return NO_FILTERABLE_FIELDS;
    }

    // Key on the index + experience/model: the same phrase can be interpreted differently
    // depending on provider/model and per-experience instructions. The instructions are
    // fingerprinted rather than assumed constant per experience — an admin can edit them,
    // and without this the old interpretation would be served for the rest of the TTL.
    // The query is kept as typed, letter case included, like the rewrite's key: the cached
    // effective query is searched as is, so codes and names keep this visitor's capitals.
    const cacheKey = `${searchIndexId}:${options.experienceId ?? 'no-exp'}:${options.providerId ?? 'default'}:${options.modelId ?? 'default'}:${fingerprint(config.customInstructions)}:${query.trim()}`;
    return interpretationCache.getOrSet<QueryInterpretation | null>(cacheKey, async () => {
        const systemPrompt = buildInterpreterPrompt(constraints, config.customInstructions);

        const completion = await startSharedCall(signal => aiService.chat(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query },
            ],
            {
                providerId: options.providerId ?? undefined,
                modelId: options.modelId ?? undefined,
                temperature: 0,
                maxTokens: 500,
                feature: 'search_query_understanding',
                experienceId: options.experienceId,
                signal,
                responseFormat: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'query_interpretation',
                        strict: true,
                        schema: INTERPRETER_SCHEMA as unknown as {
                            type: 'object';
                            properties: Record<string, unknown>;
                            required?: string[];
                            additionalProperties?: boolean;
                        },
                    },
                },
            },
        ));

        const parsed = parseInterpretation(completionText(completion), query);
        if (!parsed) {
            return null;
        }

        // Same validation the agentic path uses: drops unknown or non-filterable
        // fields and canonicalises text values against the index's real ones.
        const validation = validateFilters(parsed.filters, toParameterContext(constraints));

        return {
            originalQuery: query,
            effectiveQuery: parsed.query,
            appliedFilters: validation.filters,
            droppedFilters: validation.droppedFilters.map(d => ({
                field: d.field,
                reason: d.reason,
            })),
            interpreted: true,
            outcome: 'interpreted',
            durationMs: 0,
        };
    });
}

// ============================================================================
// SEARCH TERMS FOR EXTERNAL SOURCES
// ============================================================================

export type QueryRewriteOutcome = 'rewritten' | 'unchanged' | 'skipped' | 'failed' | 'timed_out';

export interface QueryRewrite {
    /** What the visitor typed */
    originalQuery: string;
    /** What external sources are searched for: the visitor's words unless rewritten */
    query: string;
    outcome: QueryRewriteOutcome;
    durationMs: number;
}

/**
 * Rewrite a visitor's question into search terms for external sources.
 *
 * Same switches as filter interpretation. Never throws: every failure, and a step
 * past the time limit, returns the visitor's words.
 */
export async function rewriteQueryForExternalSearch(options: {
    query: string;
    aiConfig?: SearchExperienceAIConfig;
    experienceId?: string;
}): Promise<QueryRewrite> {
    const startedAt = Date.now();
    const { query, aiConfig, experienceId } = options;
    const done = (outcome: QueryRewriteOutcome, rewritten = query): QueryRewrite => ({
        originalQuery: query,
        query: rewritten,
        outcome,
        durationMs: Date.now() - startedAt,
    });

    const config = aiConfig?.queryUnderstanding;
    if (!aiConfig?.enabled || !config?.enabled || !shouldRewrite(query, config.minWords ?? 3)) {
        return done('skipped');
    }
    const timeoutMs = resolveTimeoutMs(config);
    // Keyed on the words as typed, letter case included: the rewrite keeps codes and names as the
    // visitor wrote them, and "unchanged" is judged against this visitor's own words
    const cacheKey = `${experienceId ?? 'no-exp'}:${aiConfig.providerId ?? 'default'}:${aiConfig.modelId ?? 'default'}:${fingerprint(config.customInstructions)}:${query.trim()}`;

    try {
        // Part of AI summaries, like filter interpretation
        if (!(await summariesAreaOn())) {
            return done('skipped');
        }

        // A null result (nothing usable) is not kept: the cache treats null as a miss
        const rewritten = await withTimeLimit(timeoutMs, () =>
            rewriteCache.getOrSet<string | null>(cacheKey, async () => {
                const completion = await startSharedCall(signal => aiService.chat(
                    [
                        { role: 'system', content: buildRewritePrompt(config.customInstructions) },
                        { role: 'user', content: query },
                    ],
                    {
                        providerId: aiConfig.providerId ?? undefined,
                        modelId: aiConfig.modelId ?? undefined,
                        temperature: 0,
                        maxTokens: 100,
                        feature: 'search_query_understanding',
                        experienceId,
                        signal,
                        responseFormat: {
                            type: 'json_schema',
                            json_schema: {
                                name: 'query_rewrite',
                                strict: true,
                                schema: REWRITE_SCHEMA as unknown as {
                                    type: 'object';
                                    properties: Record<string, unknown>;
                                    required?: string[];
                                    additionalProperties?: boolean;
                                },
                            },
                        },
                    },
                ));
                return parseRewrite(completionText(completion));
            }),
        );

        if (!rewritten) {
            logger.warn('Query rewrite returned nothing usable; searching with the raw query', { experienceId });
            return done('failed');
        }

        const outcome = rewritten === query.trim() ? 'unchanged' : 'rewritten';
        // The visitor's words stay out of the application log: the trace keeps them at the Full detail level
        logger.info('Query rewritten for external search', {
            experienceId,
            outcome,
            durationMs: Date.now() - startedAt,
        });
        return done(outcome, outcome === 'rewritten' ? rewritten : query);
    } catch (err) {
        if (err instanceof QueryStepTimeoutError) {
            logger.warn('Query rewrite timed out; searching with the raw query', { experienceId, timeoutMs });
            return done('timed_out');
        }
        logger[failureLevel(err, 'warn')]('Query rewrite failed; searching with the raw query', { experienceId, err });
        return done('failed');
    }
}
