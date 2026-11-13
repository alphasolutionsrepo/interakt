// app/playground/search/page.tsx

/**
 * Combined Search Playground
 *
 * Two tabs:
 * - Index Search: raw index queries with filters/facets
 * - Experience Search: search experience API with multi-index
 */

'use client';

import { Search, Sparkles, Layers } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

import { SEARCH_TAB_AREA, areaGateFor, initialSearchTab, type SearchTab } from '../_lib/area-gate';

import { SearchPlayground } from './_components/SearchPlayground';

import { cn } from '@/lib/utils';
import { AreaOffNote } from '@/shared/access/AreaOffNote';
import { useAccess } from '@/shared/access/useAccess';
import { PageHeader } from '@/shared/ui/custom/PageHeader';

// Lazy-load unified search to avoid bloating the initial bundle
const UnifiedSearchPlayground = dynamic(
  () => import('../../playground/unified-search/_components/UnifiedSearchPlayground').then(m => ({ default: m.UnifiedSearchPlayground })),
  { loading: () => <div className="flex items-center justify-center h-96 text-muted-foreground text-sm">Loading...</div> },
);

const TABS: { id: SearchTab; label: string; icon: typeof Search; desc: string }[] = [
  { id: 'index', label: 'Index Search', icon: Search, desc: 'Query a raw search index directly' },
  { id: 'experience', label: 'Experience Search', icon: Sparkles, desc: 'Test the consumer-facing search experience API' },
];

export default function SearchPlaygroundPage() {
  const { areaOn, access, isLoading } = useAccess();
  // Each tab follows its own area: Index Search needs Managed indexes, Experience Search needs
  // Search. The page opens on a tab that is on, until the user picks one.
  const [picked, setPicked] = useState<SearchTab | null>(null);
  const activeTab = picked ?? initialSearchTab(areaOn);
  const tabGate = (id: SearchTab) => areaGateFor({ state: 'allowed' }, SEARCH_TAB_AREA[id], areaOn, access);
  const offTabs = isLoading ? [] : TABS.filter((t) => tabGate(t.id).state === 'locked');

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b bg-background px-6 py-5 lg:px-8 space-y-4">
        <PageHeader
          variant="hero"
          title="Search Playground"
          description="Test and debug search queries against raw indexes or through the search experience API."
          icon={Layers}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-600 dark:text-blue-400"
        />

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border/50 w-fit">
          {TABS.map((tab) => {
            const gate = tabGate(tab.id);
            const locked = !isLoading && gate.state === 'locked';
            return (
            <button
              key={tab.id}
              type="button"
              disabled={locked}
              title={gate.state === 'locked' && !isLoading ? gate.reason : undefined}
              onClick={() => setPicked(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer',
                activeTab === tab.id
                  ? 'bg-background text-foreground shadow-sm border border-border/60'
                  : 'text-muted-foreground hover:text-foreground',
                locked && 'opacity-50 cursor-not-allowed hover:text-muted-foreground',
              )}
            >
              <tab.icon className="size-4" />
              {tab.label}
            </button>
            );
          })}
        </div>
        {offTabs.map((t) => (
          <AreaOffNote key={t.id} area={SEARCH_TAB_AREA[t.id]} detail={`${t.label} can't be used here.`} />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {isLoading ? null : activeTab === 'index' ? (
          // Not rendered with Managed indexes off: it would fetch routes the server refuses
          areaOn('managed-indexes') ? <SearchPlayground hideHeader /> : null
        ) : (
          <UnifiedSearchPlayground hideHeader />
        )}
      </div>
    </div>
  );
}
