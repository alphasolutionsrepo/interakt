// app/analytics/overview/page.tsx

'use client';

import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Plus, Sparkles } from 'lucide-react';

import { useAnalyticsContext } from '../_lib/AnalyticsContext';
import { useAskPanel } from '../_lib/AskPanelContext';
import { ANALYTICS_SECTIONS } from '../_lib/sections';
import { AnalyticsEmptyState } from '../_components/AnalyticsEmptyState';
import { ExperienceComparisonTable } from '../_components/ExperienceComparisonTable';
import { NeedsAttention } from '../_components/NeedsAttention';
import { useDashboardView } from '../_components/sections/useDashboardView';
import { AskConversation } from '../_components/shell/AskConversation';
import { ChatHistoryButton } from '../_components/shell/ChatHistoryButton';

import { Button } from '@/shared/ui/components/button';

const OVERVIEW_SUGGESTIONS = ANALYTICS_SECTIONS[0].suggestions;

/**
 * Overview: a briefing. What needs attention on one side, the conversation on
 * the other, so a finding can be questioned straight away. Figures live in the
 * Search, Conversations and AI & cost sections.
 */
export default function AnalyticsOverviewPage() {
  const queryClient = useQueryClient();
  const view = useDashboardView();

  // Nothing recorded anywhere yet: explain how data arrives instead of an empty briefing
  if (!view.isLoading && !view.hasData && view.isAllExperiences) {
    return <AnalyticsEmptyState variant="overview" onRefresh={() => queryClient.invalidateQueries({ queryKey: ['analytics'] })} />;
  }

  return (
    <div className="space-y-6">
      <div className="grid items-start gap-6 @5xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0">
          <NeedsAttention />
        </div>
        <InlineConversation />
      </div>
      {/* Full width below, so experience names have room */}
      {view.isAllExperiences && <ExperienceComparisonTable />}
    </div>
  );
}

/** The conversation, inline: the same one the Ask drawer shows on other sections */
function InlineConversation() {
  const { chat } = useAskPanel();
  const { experienceId, experienceName } = useAnalyticsContext();

  return (
    <section
      aria-label="Ask about your analytics"
      className="flex h-[640px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm @5xl:h-[calc(100vh-14rem)] @5xl:min-h-[520px]"
    >
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <Sparkles className="size-4 text-viz-1" aria-hidden /> Ask
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            About {experienceId ? experienceName : 'all experiences'}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <ChatHistoryButton />
          {chat.sessionId && (
            <Button variant="ghost" size="icon" className="size-9" asChild>
              <Link href={`/analytics/chat?session=${chat.sessionId}`} aria-label="Open in full chat">
                <ExternalLink className="size-4" />
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="icon" className="size-9" onClick={chat.startNew} aria-label="New conversation">
            <Plus className="size-4" />
          </Button>
        </div>
      </div>
      <AskConversation suggestions={OVERVIEW_SUGGESTIONS} inputId="ask-inline-input" />
    </section>
  );
}
