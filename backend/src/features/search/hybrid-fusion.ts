// src/features/search/hybrid-fusion.ts

/**
 * Hybrid Search Result Fusion
 *
 * Implements custom Reciprocal Rank Fusion (RRF) algorithm for combining
 * results from lexical and semantic searches without requiring Elasticsearch
 * Platinum/Enterprise license.
 *
 * RRF Formula: score(d) = Σ 1 / (k + rank(d))
 * Where k is the rank constant (default 60)
 */

import type { ProviderHit, TotalHits } from './search.types';

// ============================================================================
// TYPES
// ============================================================================

export interface RRFConfig {
    /** Rank constant (k) - higher values reduce impact of high-ranked docs */
    rankConstant: number;
    /** Window size - how many results to consider from each source */
    windowSize: number;
    /** Weight for lexical results (0-1) */
    lexicalWeight?: number;
    /** Weight for semantic results (0-1) */
    semanticWeight?: number;
}

export interface HybridSearchResult {
    hits: ProviderHit[];
    total: TotalHits;
    took: number;
    maxScore?: number;
    /** Debug info about fusion */
    fusionInfo?: {
        lexicalCount: number;
        semanticCount: number;
        mergedCount: number;
        overlappingDocs: number;
    };
}

export interface FusionInput {
    lexicalHits: ProviderHit[];
    lexicalTotal: TotalHits;
    semanticHits: ProviderHit[];
    semanticTotal: TotalHits;
    config: RRFConfig;
    page: number;
    pageSize: number;
}

// ============================================================================
// RRF FUSION ALGORITHM
// ============================================================================

/**
 * Fuse lexical and semantic search results using Reciprocal Rank Fusion
 */
export function fuseSearchResults(input: FusionInput): HybridSearchResult {
    const {
        lexicalHits,
        lexicalTotal,
        semanticHits,
        semanticTotal,
        config,
        page,
        pageSize,
    } = input;

    const k = config.rankConstant;
    const lexicalWeight = config.lexicalWeight ?? 1.0;
    const semanticWeight = config.semanticWeight ?? 1.0;

    // Build document score map
    const docScores = new Map<string, {
        rrfScore: number;
        lexicalRank?: number;
        semanticRank?: number;
        lexicalScore?: number;
        semanticScore?: number;
        hit: ProviderHit;
    }>();

    // Process lexical results
    lexicalHits.forEach((hit, index) => {
        const rank = index + 1;
        const rrfContribution = lexicalWeight / (k + rank);

        const existing = docScores.get(hit.id);
        if (existing) {
            existing.rrfScore += rrfContribution;
            existing.lexicalRank = rank;
            existing.lexicalScore = hit.score;
            // Merge highlights from lexical (usually better for text highlighting)
            if (hit.highlight) {
                existing.hit.highlight = {
                    ...existing.hit.highlight,
                    ...hit.highlight,
                };
            }
        } else {
            docScores.set(hit.id, {
                rrfScore: rrfContribution,
                lexicalRank: rank,
                lexicalScore: hit.score,
                hit: { ...hit },
            });
        }
    });

    // Process semantic results
    semanticHits.forEach((hit, index) => {
        const rank = index + 1;
        const rrfContribution = semanticWeight / (k + rank);

        const existing = docScores.get(hit.id);
        if (existing) {
            existing.rrfScore += rrfContribution;
            existing.semanticRank = rank;
            existing.semanticScore = hit.score;
        } else {
            docScores.set(hit.id, {
                rrfScore: rrfContribution,
                semanticRank: rank,
                semanticScore: hit.score,
                hit: { ...hit },
            });
        }
    });

    // Sort by RRF score (descending)
    const sortedDocs = Array.from(docScores.entries())
        .sort((a, b) => b[1].rrfScore - a[1].rrfScore);

    // Apply pagination - calculate start and end indices
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const topDocs = sortedDocs.slice(startIndex, endIndex);

    // Normalize scores to 0-1 range for consistency
    const maxRrfScore = topDocs.length > 0 ? topDocs[0][1].rrfScore : 1;

    const fusedHits: ProviderHit[] = topDocs.map(([_id, data]) => ({
        ...data.hit,
        score: maxRrfScore > 0 ? data.rrfScore / maxRrfScore : 0,
    }));

    // Calculate total.
    //
    // The semantic (kNN) leg always returns exactly `k` hits (= the RRF window
    // size), regardless of how relevant they are — every document is *some*
    // nearest neighbour in vector space. So semanticTotal is an artifact of the
    // window (e.g. always 100), not a count of matching documents, and taking
    // max(lexical, semantic) pins the reported total to the window size.
    //
    // The lexical (keyword) leg is the authoritative relevance count: it reflects
    // how many documents genuinely match the query, and matches what dedicated
    // engines like Azure AI Search report. Use it as the total. Fall back to the
    // semantic count only for pure-semantic queries where lexical found nothing.
    const lexicalHasMatches = lexicalTotal.value > 0;
    const totalValue = lexicalHasMatches ? lexicalTotal.value : semanticTotal.value;
    const totalRelation = lexicalHasMatches
        ? lexicalTotal.relation
        : (semanticTotal.relation === 'gte' ? 'gte' as const : 'eq' as const);

    // Count overlapping documents
    const lexicalIds = new Set(lexicalHits.map(h => h.id));
    const semanticIds = new Set(semanticHits.map(h => h.id));
    const overlappingDocs = Array.from(lexicalIds).filter(id => semanticIds.has(id)).length;

    return {
        hits: fusedHits,
        total: {
            value: totalValue,
            relation: totalRelation,
        },
        took: 0, // Will be set by caller
        maxScore: fusedHits.length > 0 ? fusedHits[0].score : undefined,
        fusionInfo: {
            lexicalCount: lexicalHits.length,
            semanticCount: semanticHits.length,
            mergedCount: docScores.size,
            overlappingDocs,
        },
    };
}

/**
 * Calculate RRF score for a single document
 */
export function calculateRRFScore(
    lexicalRank: number | undefined,
    semanticRank: number | undefined,
    config: RRFConfig
): number {
    const k = config.rankConstant;
    const lexicalWeight = config.lexicalWeight ?? 1.0;
    const semanticWeight = config.semanticWeight ?? 1.0;

    let score = 0;

    if (lexicalRank !== undefined) {
        score += lexicalWeight / (k + lexicalRank);
    }

    if (semanticRank !== undefined) {
        score += semanticWeight / (k + semanticRank);
    }

    return score;
}

/**
 * Default RRF configuration
 */
export const DEFAULT_RRF_CONFIG: RRFConfig = {
    rankConstant: 60,
    windowSize: 100,
    lexicalWeight: 1.0,
    semanticWeight: 1.0,
};

/**
 * Create RRF config with defaults
 */
export function createRRFConfig(
    partial?: Partial<RRFConfig>
): RRFConfig {
    return {
        ...DEFAULT_RRF_CONFIG,
        ...partial,
    };
}
