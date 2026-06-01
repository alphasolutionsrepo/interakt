// src/features/analytics/proactive-insights.service.ts

/**
 * Proactive Insights Service
 *
 * Runs heuristic checks across pre-computed analytics data to detect
 * anomalies, opportunities, and issues worth surfacing to the admin.
 */

import 'server-only';

import type { IntentClusteringResult } from './intent-clustering';
import { getThresholds } from './analytics-thresholds';

// ============================================================================
// TYPES
// ============================================================================

export type InsightSeverity = 'critical' | 'warning' | 'info';
export type InsightCategory =
  | 'search_quality'
  | 'content_gap'
  | 'ai_behavior'
  | 'cost'
  | 'demand';

export interface ProactiveInsight {
  id: string;
  severity: InsightSeverity;
  category: InsightCategory;
  title: string;
  description: string;
  metric?: string;
  suggestedAction?: string;
}

export interface InsightInputs {
  clusters: IntentClusteringResult;
  demandSignals: Record<string, unknown>;
  catalogHealth: Record<string, unknown>;
  effectiveness: Record<string, unknown>;
  costAnalysis: Record<string, unknown>;
  guardrails: Record<string, unknown>;
  timeRange: string;
}

// ============================================================================
// MAIN DETECTION FUNCTION
// ============================================================================

export function detectProactiveInsights(inputs: InsightInputs): ProactiveInsight[] {
  const insights: ProactiveInsight[] = [];

  detectSearchQualityIssues(inputs, insights);
  detectContentGaps(inputs, insights);
  detectAIBehaviorPatterns(inputs, insights);
  detectCostAnomalies(inputs, insights);
  detectDemandSignals(inputs, insights);

  // Sort by severity: critical > warning > info
  const severityOrder: Record<InsightSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return insights;
}

// ============================================================================
// SEARCH QUALITY
// ============================================================================

function detectSearchQualityIssues(
  inputs: InsightInputs,
  insights: ProactiveInsight[]
) {
  const catalog = inputs.catalogHealth;
  const t = getThresholds().insights;

  // High real zero-result rate
  const realZeroRate = Number(catalog.realZeroResultRate ?? 0);
  if (realZeroRate > t.zeroResultWarning) {
    insights.push({
      id: 'search_quality_high_zero_rate',
      severity: realZeroRate > t.zeroResultCritical ? 'critical' : 'warning',
      category: 'search_quality',
      title: 'High zero-result rate',
      description: `${(realZeroRate * 100).toFixed(1)}% of searches return no results (after retry deduplication). Customers may not be finding what they need.`,
      metric: `${(realZeroRate * 100).toFixed(1)}% zero-result rate`,
      suggestedAction: 'Review top zero-result queries and check if catalog content exists for these terms.',
    });
  }

  // High retry rate
  const retryRate = Number(catalog.retryRate ?? 0);
  if (retryRate > t.retryRateWarning) {
    insights.push({
      id: 'search_quality_high_retry_rate',
      severity: 'warning',
      category: 'search_quality',
      title: 'High search retry rate',
      description: `${(retryRate * 100).toFixed(1)}% of searches required retries. The AI is working harder to find results, which increases response time and cost.`,
      metric: `${(retryRate * 100).toFixed(1)}% retry rate`,
      suggestedAction: 'Check if search indexes need reindexing or if filters are too restrictive.',
    });
  }

  // Low success rate
  const effectiveness = inputs.effectiveness;
  const successRate = Number(effectiveness.successRate ?? 1);
  if (successRate < t.successRateWarning) {
    insights.push({
      id: 'search_quality_low_success',
      severity: successRate < t.successRateCritical ? 'critical' : 'warning',
      category: 'search_quality',
      title: 'Low AI success rate',
      description: `Only ${(successRate * 100).toFixed(1)}% of conversations succeed. Plan failures or context assembly issues may need investigation.`,
      metric: `${(successRate * 100).toFixed(1)}% success rate`,
      suggestedAction: 'Check AI effectiveness details to understand which failure modes are most common.',
    });
  }
}

// ============================================================================
// CONTENT GAPS
// ============================================================================

function detectContentGaps(
  inputs: InsightInputs,
  insights: ProactiveInsight[]
) {
  const catalog = inputs.catalogHealth;
  const t = getThresholds().insights;
  const topZeroQueries = (catalog.topZeroResultQueries as Array<{ query: string; count: number }>) || [];

  if (topZeroQueries.length > 0) {
    const topQuery = topZeroQueries[0];
    const totalGaps = topZeroQueries.length;

    insights.push({
      id: 'content_gap_zero_result_queries',
      severity: totalGaps > t.contentGapWarning ? 'warning' : 'info',
      category: 'content_gap',
      title: `${totalGaps} queries returning no results`,
      description: `Top query with no results: "${topQuery.query}" (${topQuery.count} times). These represent potential content gaps in your catalog.`,
      metric: `${totalGaps} zero-result queries`,
      suggestedAction: 'Review these queries and add matching content to your catalog, or adjust search synonyms.',
    });
  }

  // Clusters with low success rate (users asking about things AI can't help with)
  const lowSuccessClusters = inputs.clusters.clusters.filter(
    (c) => c.avgOutcomeSuccess < t.clusterFailureThreshold && c.count >= t.clusterMinCount
  );
  if (lowSuccessClusters.length > 0) {
    const topCluster = lowSuccessClusters[0];
    insights.push({
      id: 'content_gap_failing_intents',
      severity: 'warning',
      category: 'content_gap',
      title: `"${topCluster.label}" queries frequently failing`,
      description: `${topCluster.count} queries about "${topCluster.label}" have only ${(topCluster.avgOutcomeSuccess * 100).toFixed(0)}% success rate. This intent category may need better catalog coverage.`,
      metric: `${(topCluster.avgOutcomeSuccess * 100).toFixed(0)}% success for "${topCluster.label}"`,
      suggestedAction: 'Add or improve catalog content for this topic, or configure the AI to handle these queries differently.',
    });
  }
}

// ============================================================================
// AI BEHAVIOR PATTERNS
// ============================================================================

function detectAIBehaviorPatterns(
  inputs: InsightInputs,
  insights: ProactiveInsight[]
) {
  const guardrails = inputs.guardrails;
  const t = getThresholds().insights;

  // High block rate
  const blockedRate = Number(guardrails.blockedRate ?? 0);
  if (blockedRate > t.guardrailBlockInfo) {
    insights.push({
      id: 'ai_behavior_high_block_rate',
      severity: blockedRate > t.guardrailBlockWarning ? 'warning' : 'info',
      category: 'ai_behavior',
      title: 'High guardrail block rate',
      description: `${(blockedRate * 100).toFixed(1)}% of queries are being blocked by guardrails. Some legitimate queries may be incorrectly filtered.`,
      metric: `${(blockedRate * 100).toFixed(1)}% blocked`,
      suggestedAction: 'Review guardrail analytics to check if domain filter thresholds need adjustment.',
    });
  }

  // High direct response rate (AI not using tools)
  const decisions = (inputs.effectiveness.decisions || {}) as Record<string, number>;
  const totalDecisions = Object.values(decisions).reduce((a, b) => a + b, 0);
  const directRate = totalDecisions > 0 ? (decisions.direct_response || 0) / totalDecisions : 0;

  if (directRate > t.directResponseInfo && totalDecisions > 10) {
    insights.push({
      id: 'ai_behavior_high_direct_response',
      severity: 'info',
      category: 'ai_behavior',
      title: 'AI frequently responds without searching',
      description: `${(directRate * 100).toFixed(1)}% of queries get direct responses without tool use. This could mean queries are general/conversational, or the AI isn't searching when it should.`,
      metric: `${(directRate * 100).toFixed(1)}% direct responses`,
      suggestedAction: 'Check customer intent analysis to see what types of queries are getting direct responses.',
    });
  }
}

// ============================================================================
// COST ANOMALIES
// ============================================================================

function detectCostAnomalies(
  inputs: InsightInputs,
  insights: ProactiveInsight[]
) {
  const cost = inputs.costAnalysis;
  const t = getThresholds().insights;

  // High retry waste
  const retryWaste = Number(cost.retryWastePercentage ?? 0);
  if (retryWaste > t.retryWasteInfo) {
    insights.push({
      id: 'cost_retry_waste',
      severity: retryWaste > t.retryWasteWarning ? 'warning' : 'info',
      category: 'cost',
      title: 'Significant token waste from retries',
      description: `${(retryWaste * 100).toFixed(1)}% of token usage is spent on retry attempts. Improving first-attempt success would reduce costs.`,
      metric: `${(retryWaste * 100).toFixed(1)}% retry waste`,
      suggestedAction: 'Investigate which queries trigger retries and optimize search configuration for those patterns.',
    });
  }

  // High max tokens per conversation (outlier detection)
  const maxTokens = Number(cost.maxTokensPerConversation ?? 0);
  const avgTokens = Number(cost.avgTokensPerConversation ?? 0);
  if (avgTokens > 0 && maxTokens > avgTokens * 5) {
    insights.push({
      id: 'cost_outlier_conversation',
      severity: 'info',
      category: 'cost',
      title: 'Token usage outlier detected',
      description: `One conversation used ${maxTokens.toLocaleString()} tokens vs an average of ${avgTokens.toLocaleString()}. This could indicate a complex query or a loop.`,
      metric: `${maxTokens.toLocaleString()} max vs ${avgTokens.toLocaleString()} avg tokens`,
      suggestedAction: 'Review the most expensive conversation traces for unexpected behavior.',
    });
  }
}

// ============================================================================
// DEMAND SIGNALS
// ============================================================================

function detectDemandSignals(
  inputs: InsightInputs,
  insights: ProactiveInsight[]
) {
  const demand = inputs.demandSignals;
  const topBrands = (demand.topBrands as Array<{ name: string; count: number }>) || [];
  const topCategories = (demand.topCategories as Array<{ name: string; count: number }>) || [];

  if (topBrands.length > 0) {
    const topBrand = topBrands[0];
    insights.push({
      id: 'demand_top_brand',
      severity: 'info',
      category: 'demand',
      title: `"${topBrand.name}" is the most searched brand`,
      description: `${topBrand.count} searches mention "${topBrand.name}". ${topBrands.length > 1 ? `Followed by "${topBrands[1].name}" (${topBrands[1].count}).` : ''}`,
      metric: `${topBrand.count} mentions`,
    });
  }

  if (topCategories.length > 0) {
    const topCategory = topCategories[0];
    insights.push({
      id: 'demand_top_category',
      severity: 'info',
      category: 'demand',
      title: `"${topCategory.name}" is the most popular category`,
      description: `${topCategory.count} searches involve "${topCategory.name}".`,
      metric: `${topCategory.count} searches`,
    });
  }

  // High volume of unique intents (diverse user base)
  if (inputs.clusters.uniqueIntents > 50 && inputs.clusters.clusters.length > 15) {
    insights.push({
      id: 'demand_diverse_intents',
      severity: 'info',
      category: 'demand',
      title: 'Highly diverse customer intents',
      description: `${inputs.clusters.uniqueIntents} unique intents across ${inputs.clusters.clusters.length} categories. Your customers have varied needs — ensure catalog coverage is broad.`,
      metric: `${inputs.clusters.uniqueIntents} unique intents`,
    });
  }
}
