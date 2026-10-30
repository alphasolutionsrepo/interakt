// app/analytics/ai/page.tsx

'use client';

import { Coins } from 'lucide-react';

import { useStoredInsight } from '../_lib/hooks/useAnalytics';
import { AIOperationsCard, SectionHeader, ToolUsageCard, safeNumber } from '../_components/sections/dashboard-cards';
import { InsightSourceNote } from '../_components/sections/InsightSource';
import { ModelCallsTile, ToolCallsTile, useDashboardView } from '../_components/sections/useDashboardView';
import { ChartCard, StatTile, formatCompact, formatMs, formatPercent } from '../_components/viz';

interface CostAnalysis {
  totalConversations: number;
  avgTokensPerConversation: number;
  maxTokensPerConversation: number;
  retryWastePercentage: number;
}

/**
 * AI & cost: model calls, tokens and cost, and which tools the AI used.
 */
export default function AnalyticsAIPage() {
  const view = useDashboardView();
  const cost = useStoredInsight<CostAnalysis>('cost_analysis', view.timeRange, view.experienceId);
  const estimatedCost = safeNumber(view.data?.aiUsage?.estimatedCostUsd);
  const perConversation = cost.data?.status === 'ready' ? cost.data.data : null;

  return (
    <div className="space-y-6">
      <SectionHeader
        description={
          view.isAllExperiences
            ? `AI model usage across the platform, including embeddings created while indexing documents. ${view.periodLabel}`
            : `AI model usage and tool calls made while answering this experience’s conversations. ${view.periodLabel}`
        }
      />

      <div className="grid gap-4 @lg:grid-cols-2 @5xl:grid-cols-4">
        <ModelCallsTile view={view} label="Model calls" />
        <StatTile
          loading={view.isLoading}
          label="Tokens"
          change={view.changes?.tokens}
          comparedWith={view.comparedWith}
          value={formatCompact(safeNumber(view.data?.aiUsage?.totalTokens))}
          hint={`${formatCompact(safeNumber(view.data?.aiUsage?.inputTokens))} in · ${formatCompact(safeNumber(view.data?.aiUsage?.outputTokens))} out`}
        />
        <ToolCallsTile view={view} />
        {estimatedCost > 0 ? (
          <StatTile
            loading={view.isLoading}
            label="Estimated cost"
          change={view.changes?.cost}
          comparedWith={view.comparedWith}
            value={`$${estimatedCost.toFixed(estimatedCost < 10 ? 2 : 0)}`}
            hint="From model prices; check your provider's bill"
          />
        ) : (
          <StatTile
            loading={view.isLoading}
            label="AI response time"
          change={view.changes?.modelTime}
          comparedWith={view.comparedWith}
            value={view.totalAIRequests > 0 ? formatMs(view.avgAIDurationMs) : '—'}
            hint="Average per model call"
          />
        )}
      </div>

      {perConversation && (
        <ChartCard title="Tokens per conversation" icon={Coins} description="How much each conversation used">
          <div className="space-y-4">
            <InsightSourceNote result={cost.data} />
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-muted-foreground">Average</dt>
                <dd className="text-2xl font-semibold">{formatCompact(perConversation.avgTokensPerConversation)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Largest</dt>
                <dd className="text-2xl font-semibold">{formatCompact(perConversation.maxTokensPerConversation)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Spent on retries</dt>
                <dd className="text-2xl font-semibold">{formatPercent(perConversation.retryWastePercentage)}</dd>
              </div>
            </dl>
          </div>
        </ChartCard>
      )}

      <div className="grid items-start gap-6 @4xl:grid-cols-3">
        <div className="@4xl:col-span-2">
          <ToolUsageCard data={view.data?.toolUsage?.byTool} loading={view.isLoading} refreshing={view.refreshing} />
        </div>
        <AIOperationsCard data={view.data?.aiUsage?.byOperation} loading={view.isLoading} refreshing={view.refreshing} />
      </div>
    </div>
  );
}
