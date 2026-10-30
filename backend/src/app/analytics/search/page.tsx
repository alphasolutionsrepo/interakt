// app/analytics/search/page.tsx

'use client';

import { AlertTriangle, Bot } from 'lucide-react';

import { useAskPanel } from '../_lib/AskPanelContext';
import { QualityScore, calculateQualityScore } from '../_components/QualityScore';
import { RecentSearchesFeed } from '../_components/RecentSearchesFeed';
import {
  FailedSearchesCard,
  PopularQueriesCard,
  SearchActivityCard,
  SearchMixCard,
  SectionHeader,
} from '../_components/sections/dashboard-cards';
import {
  FoundResultsTile,
  SearchSpeedTile,
  SearchesTile,
  TopQueryTile,
  useDashboardView,
} from '../_components/sections/useDashboardView';
import { pluralize } from '../_components/viz';

/**
 * Search: what people searched for, how well search answered, and the most
 * recent searches.
 */
export default function AnalyticsSearchPage() {
  const view = useDashboardView();
  const askPanel = useAskPanel();
  const showQualityScore = !view.isAllExperiences && view.totalSearches > 0 && !view.searchesFromToolCalls;
  // What AI assistants searched for, kept apart from what visitors typed
  const showAssistantSearches = view.showAI && !view.searchesFromToolCalls;

  return (
    <div className="space-y-6">
      {showQualityScore && (
        <div className="grid gap-6 @3xl:grid-cols-[280px_1fr]">
          <QualityScore
            score={calculateQualityScore(view.zeroResultRate, view.avgResults, view.avgDuration)}
            successRate={view.successRate}
            avgResults={view.avgResults}
            responseTimeMs={view.avgDuration}
            isLoading={view.isLoading}
          />
          <div className="flex items-center">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">{view.experienceName}</h3>
              <p className="text-sm text-muted-foreground">
                {pluralize(view.totalSearches, 'search', 'searches')} · {view.periodLabel}
              </p>
              <p className="text-xs text-muted-foreground">
                The search quality score combines success rate, average results and response time.
              </p>
            </div>
          </div>
        </div>
      )}

      <SectionHeader
        description={`Totals include searches typed by visitors and searches made by AI assistants. Popular and failed searches list only what visitors typed. ${view.periodLabel}`}
      />
      {view.searchesFromToolCalls && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            This experience searches an external index, so search counts, speed and success rate come from the AI&apos;s
            search tool calls. Per-query details (trends, popular and failed searches) aren&apos;t available for external searches.
          </span>
        </div>
      )}

      <div className="grid gap-4 @lg:grid-cols-2 @5xl:grid-cols-4">
        <SearchesTile view={view} />
        <FoundResultsTile view={view} />
        <SearchSpeedTile view={view} />
        <TopQueryTile view={view} />
      </div>

      <div className="grid gap-6 @4xl:grid-cols-3">
        <div className="@4xl:col-span-2">
          <SearchActivityCard
            rows={view.activity}
            granularity={view.granularity}
            loading={view.isLoading}
            refreshing={view.refreshing}
          />
        </div>
        <SearchMixCard
          types={view.data?.searchTypes}
          byTrigger={view.data?.overview?.searchesByTrigger}
          loading={view.isLoading}
          refreshing={view.refreshing}
        />
      </div>

      <div className="grid gap-6 @3xl:grid-cols-2">
        <PopularQueriesCard
          data={view.data?.popularQueries}
          loading={view.isLoading}
          refreshing={view.refreshing}
          onAsk={askPanel.open}
          emptyMessage={
            showAssistantSearches && (view.data?.assistantQueries?.length ?? 0) > 0
              ? "No visitor searches yet. The assistant's searches are under Assistant searches."
              : undefined
          }
        />
        <FailedSearchesCard
          data={view.data?.zeroResults}
          emptyMessage={
            view.totalSearches === 0
              ? 'No searches in this period'
              : view.searchesFromToolCalls
                ? 'Not available for external searches'
                : undefined
          }
          assistantFailed={view.data?.assistantHasFailedSearches ?? false}
          loading={view.isLoading}
          refreshing={view.refreshing}
          onAsk={askPanel.open}
        />
      </div>

      {showAssistantSearches && (
        <PopularQueriesCard
          data={view.data?.assistantQueries}
          loading={view.isLoading}
          refreshing={view.refreshing}
          onAsk={askPanel.open}
          title="Assistant searches"
          description="What AI assistants searched for while answering visitors, with how often each query found nothing"
          icon={Bot}
        />
      )}

      <RecentSearchesFeed data={view.data?.recentSearches} isLoading={view.isLoading} refreshing={view.refreshing} />
    </div>
  );
}
