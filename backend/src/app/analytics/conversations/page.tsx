// app/analytics/conversations/page.tsx

'use client';

import Link from 'next/link';
import { MessagesSquare, ShieldCheck, Sparkles, Waypoints } from 'lucide-react';

import { useAnalyticsContext } from '../_lib/AnalyticsContext';
import { useAskPanel } from '../_lib/AskPanelContext';
import { useStoredInsight } from '../_lib/hooks/useAnalytics';
import { InsightSourceNote, InsightUnavailable } from '../_components/sections/InsightSource';
import {
  ChartCard,
  RankedList,
  ShareBar,
  StatTile,
  formatCompact,
  formatMs,
  formatPercent,
  type ShareItem,
} from '../_components/viz';

import { Button } from '@/shared/ui/components/button';

// ============================================================================
// STORED INSIGHT SHAPES (written by analytics processing)
// ============================================================================

interface Effectiveness {
  totalConversations: number;
  successRate: number;
  outcomes: { success: number; plan_failed: number; context_assembly_failed: number; unknown: number };
  decisions: { direct_response: number; tool_call: number; unknown: number };
  avgDurationMs: number;
}

interface Guardrails {
  totalClassified: number;
  classificationDistribution: Array<{ classification: string; count: number; percentage: number }>;
  blockedCount: number;
  blockedRate: number;
  blocklistMatched: number;
}

interface Intents {
  totalIntents: number;
  clusters: Array<{ label: string; count: number; avgOutcomeSuccess: number }>;
}

const CLASSIFICATION_LABEL: Record<string, string> = {
  domain: 'On topic',
  general: 'General question',
  greeting: 'Greeting',
  off_topic: 'Off topic',
  blocked: 'Blocked',
};

/**
 * Conversations: how the assistant handled turns, what the guardrail stopped,
 * and what people asked about. Read from the insights job's stored results.
 */
export default function AnalyticsConversationsPage() {
  const { experienceId, timeRange } = useAnalyticsContext();
  const askPanel = useAskPanel();
  const effectiveness = useStoredInsight<Effectiveness>('ai_effectiveness', timeRange, experienceId);
  const guardrails = useStoredInsight<Guardrails>('guardrail_analytics', timeRange, experienceId);
  const intents = useStoredInsight<Intents>('intent_clusters', timeRange, experienceId);

  const eff = effectiveness.data?.data;
  const unavailable = <InsightUnavailable result={effectiveness.data} loading={effectiveness.isLoading} />;

  return (
    <div className="space-y-6">
      <InsightSourceNote result={effectiveness.data} />

      {!eff ? (
        unavailable
      ) : (
        <>
          <div className="grid gap-4 @lg:grid-cols-2 @5xl:grid-cols-4">
            <StatTile label="Conversation turns" value={formatCompact(eff.totalConversations)} hint="Questions the assistant answered" />
            <StatTile
              label="Completed"
              value={formatPercent(eff.successRate)}
              hint={`${formatCompact(eff.totalConversations - eff.outcomes.success)} turns didn't complete`}
            />
            <StatTile
              label="Answered without tools"
              value={formatPercent(share(eff.decisions.direct_response, eff.decisions.direct_response + eff.decisions.tool_call))}
              hint={`${formatCompact(eff.decisions.tool_call)} turns searched or used tools`}
            />
            <StatTile label="Turn time" value={formatMs(eff.avgDurationMs)} hint="Average from question to answer" />
          </div>

          <div className="grid gap-6 @3xl:grid-cols-2">
            <ChartCard
              title="How turns ended"
              description="Whether the assistant finished each turn"
              icon={Waypoints}
              actions={
                <Button variant="outline" size="sm" className="rounded-xl" asChild>
                  <Link href="/analytics/traces?status=ERROR">See failed turns</Link>
                </Button>
              }
            >
              <ShareBar
                unit="turns"
                // Outcomes are states, so they take the status colours, not series colours
                items={[
                  { key: 'success', label: 'Completed', value: eff.outcomes.success, color: 'var(--viz-good)' },
                  { key: 'plan_failed', label: 'Planning failed', value: eff.outcomes.plan_failed, color: 'var(--viz-warning)' },
                  {
                    key: 'context_assembly_failed',
                    label: 'Couldn’t load the conversation',
                    value: eff.outcomes.context_assembly_failed,
                    color: 'var(--viz-serious)',
                  },
                  // A turn records its outcome when it finishes; one without stopped with an error first
                  { key: 'unknown', label: 'Stopped with an error', value: eff.outcomes.unknown, color: 'var(--viz-critical)' },
                ]}
              />
            </ChartCard>

            <GuardrailsCard result={guardrails.data} loading={guardrails.isLoading} />
          </div>
        </>
      )}

      <ChartCard
        title="What people ask about"
        description="Questions grouped by topic, with how often the assistant completed them"
        icon={MessagesSquare}
        loading={intents.isLoading}
        skeletonHeight={200}
        empty={
          intents.data?.status !== 'ready' ? (
            <InsightUnavailable result={intents.data} loading={false} />
          ) : !intents.data.data?.clusters.length ? (
            'No topics found in this period'
          ) : undefined
        }
      >
        <RankedList
          valueHeader="Turns"
          detailsHeader="Completed"
          rows={(intents.data?.data?.clusters ?? []).slice(0, 10).map((cluster) => ({
            key: cluster.label,
            label: cluster.label,
            value: cluster.count,
            valueLabel: formatCompact(cluster.count),
            details: `${formatPercent(cluster.avgOutcomeSuccess, 0)} completed`,
            action: (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-foreground"
                aria-label={`Ask about ${cluster.label}`}
                title="Ask about this"
                onClick={() => askPanel.open(`What are people asking about "${cluster.label}", and how well does the assistant answer?`)}
              >
                <Sparkles className="size-3.5" />
              </Button>
            ),
          }))}
        />
      </ChartCard>
    </div>
  );
}

function GuardrailsCard({ result, loading }: { result?: { status: string; data: Guardrails | null }; loading: boolean }) {
  const g = result?.data;
  const top = (g?.classificationDistribution ?? []).slice(0, 4);
  const rest = (g?.classificationDistribution ?? []).slice(4).reduce((sum, c) => sum + c.count, 0);
  const items: ShareItem[] = [
    ...top.map((c, i) => ({
      key: c.classification,
      label: CLASSIFICATION_LABEL[c.classification] ?? humanize(c.classification),
      value: c.count,
      color: `var(--viz-${i + 1})`,
    })),
    ...(rest > 0 ? [{ key: 'other', label: 'Other', value: rest, color: 'var(--viz-5)' }] : []),
  ];

  return (
    <ChartCard
      title="Guardrail"
      description={g ? `${formatPercent(g.blockedRate)} of questions blocked · ${formatCompact(g.blocklistMatched)} matched the blocklist` : 'How incoming questions were classified'}
      icon={ShieldCheck}
      loading={loading}
      empty={!g || items.length === 0 ? 'No guardrail checks in this period' : undefined}
    >
      <ShareBar items={items} unit="questions" />
    </ChartCard>
  );
}

/** "off_topic" → "Off topic" */
function humanize(value: string): string {
  const text = value.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function share(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}
