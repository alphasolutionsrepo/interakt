// app/playground/search/page.tsx

/**
 * Combined Search Playground
 *
 * Two tabs:
 * - Index Search: raw index queries with filters/facets
 * - Experience Search: search experience API with multi-index
 */

'use client';

import { useState } from 'react';
import { Search, Sparkles, Layers } from 'lucide-react';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { cn } from '@/lib/utils';
import { SearchPlayground } from './_components/SearchPlayground';

// Lazy-load unified search to avoid bloating the initial bundle
import dynamic from 'next/dynamic';
const UnifiedSearchPlayground = dynamic(
  () => import('../../playground/unified-search/_components/UnifiedSearchPlayground').then(m => ({ default: m.UnifiedSearchPlayground })),
  { loading: () => <div className="flex items-center justify-center h-96 text-muted-foreground text-sm">Loading...</div> },
);

type SearchTab = 'index' | 'experience';

const TABS: { id: SearchTab; label: string; icon: typeof Search; desc: string }[] = [
  { id: 'index', label: 'Index Search', icon: Search, desc: 'Query a raw search index directly' },
  { id: 'experience', label: 'Experience Search', icon: Sparkles, desc: 'Test the consumer-facing search experience API' },
];

export default function SearchPlaygroundPage() {
  const [activeTab, setActiveTab] = useState<SearchTab>('index');

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
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer',
                activeTab === tab.id
                  ? 'bg-background text-foreground shadow-sm border border-border/60'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <tab.icon className="size-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'index' ? (
          <SearchPlayground hideHeader />
        ) : (
          <UnifiedSearchPlayground hideHeader />
        )}
      </div>
    </div>
  );
}
