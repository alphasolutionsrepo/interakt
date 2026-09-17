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
 */

import 'server-only';

import { createHash } from 'node:crypto';

import { createLogger } from '@/shared/logger/logger';
import * as aiService from '@/features/ai-service';
import * as searchIndexService from '@/features/search-index/search-index.service';
import * as searchService from '@/features/search/search.service';
import { validateFilters } from '@/features/pipeline/v2/param-validation';
import type { FieldConstraint } from '@/features/pipeline/v2/parameter-context.types';
import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';
import type {
    SearchExperienceAIConfig,
    SearchExperienceQueryUnderstandingConfig,
} from '@/db/schema/search-experience.schema';
import { constraintCache, interpretationCache } from './query-interpreter.cache';
import {
    INTERPRETER_SCHEMA,
    MATCH_ALL_QUERY,
    buildInterpreterPrompt,
    parseInterpretation,
    shouldInterpret,
    toParameterContext,
    type InterpretedFilter,
} from './query-interpreter.core';

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
    durationMs: number;
}

function passthrough(query: string, startedAt: number): QueryInterpretation {
    return {
        originalQuery: query,
        effectiveQuery: query,
        appliedFilters: [],
        droppedFilters: [],
        interpreted: false,
        durationMs: Date.now() - startedAt,
    };
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
        });
        return response.facets?.find(f => f.field === field)?.buckets.map(b => String(b.key)) ?? [];
    } catch (err) {
        // A field whose values cannot be listed is still filterable; the model just
        // loses the vocabulary hint for it.
        logger.warn('Failed to fetch facet values', {
            searchIndexId,
            field,
            error: err instanceof Error ? err.message : 'Unknown error',
        });
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
        (f: SearchIndexField) => f.isIndexed && f.fieldName !== 'content_embedding',
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
 * Short, stable digest of the interpreter prompt, for use in the cache key. The
 * prompt runs to thousands of characters, so it is hashed rather than embedded —
 * this only has to distinguish versions, not resist attack.
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
        return passthrough(query, startedAt);
    }
    if (!shouldInterpret(query, config.minWords ?? 3)) {
        return passthrough(query, startedAt);
    }

    try {
        const constraints = await loadFieldConstraints(searchIndexId);
        if (Object.keys(constraints).length === 0) {
            return passthrough(query, startedAt);
        }

        const systemPrompt = buildInterpreterPrompt(constraints, config.customInstructions);

        // Key on the index + experience/model, plus a fingerprint of the whole system
        // prompt. Anything that changes how a phrase is interpreted lives in that
        // prompt — the shared rules, the admin's custom instructions, and the field
        // constraints with their enumerated values — so fingerprinting it means a
        // cached interpretation can never outlive the reasoning that produced it.
        // Keying on the experience alone would serve the old answer for the rest of
        // the TTL after any of those changed.
        const cacheKey = `${searchIndexId}:${options.experienceId ?? 'no-exp'}:${options.providerId ?? 'default'}:${options.modelId ?? 'default'}:${fingerprint(systemPrompt)}:${query.trim().toLowerCase()}`;
        const result = await interpretationCache.getOrSet<QueryInterpretation | null>(cacheKey, async () => {
            const completion = await aiService.chat(
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
            );

            // Content is a string for ordinary completions, but the type allows
            // structured blocks; only text can carry the JSON we asked for.
            const rawContent = completion.message?.content;
            const text = typeof rawContent === 'string'
                ? rawContent
                : (rawContent ?? [])
                    .map(block => (typeof block === 'object' && block !== null && 'text' in block
                        ? String((block as { text?: unknown }).text ?? '')
                        : ''))
                    .join('');

            const parsed = parseInterpretation(text, query);
            if (!parsed) {
                return null;
            }

            // Same validation the agentic path uses: drops unknown or non-filterable
            // fields and canonicalises text values against the index's real ones.
            const validation = validateFilters(parsed.filters, toParameterContext(constraints));

            // Match-all is only safe while a filter still narrows the search. The
            // parser picks it from syntactically valid filters, but validation runs
            // afterwards and can drop every one of them — an invented field name is
            // enough. Left alone, a specific question would then return the entire
            // index. Fall back to the phrase, which is what no interpretation at all
            // would have searched for.
            const effectiveQuery = parsed.query === MATCH_ALL_QUERY && validation.filters.length === 0
                ? query
                : parsed.query;

            return {
                originalQuery: query,
                effectiveQuery,
                appliedFilters: validation.filters,
                droppedFilters: validation.droppedFilters.map(d => ({
                    field: d.field,
                    reason: d.reason,
                })),
                interpreted: true,
                durationMs: 0,
            };
        });

        if (!result) {
            return passthrough(query, startedAt);
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
        // Fail open — a search that returns loose results beats one that errors.
        logger.warn('Query interpretation failed; searching with the raw query', {
            searchIndexId,
            error: err instanceof Error ? err.message : 'Unknown error',
        });
        return passthrough(query, startedAt);
    }
}
