'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Bot, Compass, ChevronRight, Sparkles, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { CreateWizard as AICreateWizard } from '@/app/ai-experiences/_components/CreateWizard/CreateWizard';
import { CreateWizard as SearchCreateWizard } from '@/app/search-experiences/_components/CreateWizard/CreateWizard';

type ExperienceType = 'ai' | 'search' | null;

export default function CreateExperiencePage() {
  return (
    <Suspense fallback={<div className="flex-1 p-6 lg:p-8"><div className="animate-pulse space-y-6"><div className="h-16 bg-muted rounded-2xl" /><div className="h-64 bg-muted rounded-2xl" /></div></div>}>
      <CreateExperienceContent />
    </Suspense>
  );
}

function CreateExperienceContent() {
  const searchParams = useSearchParams();
  const preselected = searchParams.get('type') as ExperienceType;
  const [selectedType, setSelectedType] = useState<ExperienceType>(preselected);

  if (selectedType === 'ai') {
    return (
      <div className="flex-1 space-y-6 p-6 lg:p-8">
        <PageHeader
          variant="detail"
          title="Create AI Experience"
          description="Build a conversational AI experience with tools and pipelines."
          breadcrumb={
            <>
              <Link href="/experiences" className="hover:text-foreground transition-colors font-medium">Experiences</Link>
              <ChevronRight className="size-3.5" />
              <Link href="/experiences/create" className="hover:text-foreground transition-colors font-medium" onClick={(e) => { e.preventDefault(); setSelectedType(null); }}>Create</Link>
              <ChevronRight className="size-3.5" />
              <span className="text-foreground font-medium">AI Experience</span>
            </>
          }
          customIcon={
            <div className="relative">
              <div className="flex size-12 items-center justify-center rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
                <Bot className="size-6 text-indigo-500" />
              </div>
            </div>
          }
        />
        <AICreateWizard basePath="/experiences/ai" />
      </div>
    );
  }

  if (selectedType === 'search') {
    return (
      <div className="flex-1 space-y-6 p-6 lg:p-8">
        <PageHeader
          variant="detail"
          title="Create Search Experience"
          description="Build a search experience with AI summaries and multi-index support."
          breadcrumb={
            <>
              <Link href="/experiences" className="hover:text-foreground transition-colors font-medium">Experiences</Link>
              <ChevronRight className="size-3.5" />
              <Link href="/experiences/create" className="hover:text-foreground transition-colors font-medium" onClick={(e) => { e.preventDefault(); setSelectedType(null); }}>Create</Link>
              <ChevronRight className="size-3.5" />
              <span className="text-foreground font-medium">Search Experience</span>
            </>
          }
          customIcon={
            <div className="relative">
              <div className="flex size-12 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20">
                <Compass className="size-6 text-violet-500" />
              </div>
            </div>
          }
        />
        <SearchCreateWizard basePath="/experiences/search" listPath="/experiences" />
      </div>
    );
  }

  // Type selector
  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      <PageHeader
        variant="detail"
        title="Create Experience"
        description="Choose the type of experience you want to create."
        breadcrumb={
          <>
            <Link href="/experiences" className="hover:text-foreground transition-colors font-medium">Experiences</Link>
            <ChevronRight className="size-3.5" />
            <span className="text-foreground font-medium">Create</span>
          </>
        }
        customIcon={
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <Sparkles className="size-6 text-primary" />
          </div>
        }
      />

      <div className="grid md:grid-cols-2 gap-6 max-w-3xl">
        {/* AI Experience Card */}
        <button
          onClick={() => setSelectedType('ai')}
          className="group relative flex flex-col items-start text-left rounded-2xl border border-border/60 bg-card shadow-sm p-8 transition-all duration-200 hover:shadow-md hover:border-indigo-500/30 hover:bg-indigo-500/[0.02]"
        >
          <div className="flex size-14 items-center justify-center rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20 mb-5">
            <Bot className="size-7 text-indigo-500" />
          </div>
          <h3 className="text-lg font-semibold mb-2">AI Experience</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            Build conversational AI assistants powered by tools and configurable pipelines. Great for chatbots, support agents, and interactive Q&A.
          </p>
          <div className="mt-auto flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 group-hover:gap-3 transition-all">
            Get started <ArrowRight className="size-4" />
          </div>
        </button>

        {/* Search Experience Card */}
        <button
          onClick={() => setSelectedType('search')}
          className="group relative flex flex-col items-start text-left rounded-2xl border border-border/60 bg-card shadow-sm p-8 transition-all duration-200 hover:shadow-md hover:border-violet-500/30 hover:bg-violet-500/[0.02]"
        >
          <div className="flex size-14 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20 mb-5">
            <Compass className="size-7 text-violet-500" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Search Experience</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            Create search interfaces with multi-index support, AI summaries, and configurable result displays. Ideal for product search and knowledge bases.
          </p>
          <div className="mt-auto flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400 group-hover:gap-3 transition-all">
            Get started <ArrowRight className="size-4" />
          </div>
        </button>
      </div>
    </div>
  );
}
