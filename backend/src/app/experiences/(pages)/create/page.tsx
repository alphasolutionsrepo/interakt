'use client';

import { Bot, Compass, ChevronRight, Sparkles, ArrowRight, Lock } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';

import { CreateWizard as AICreateWizard } from '@/app/ai-experiences/_components/CreateWizard/CreateWizard';
import { CreateWizard as SearchCreateWizard } from '@/app/search-experiences/_components/CreateWizard/CreateWizard';
import { EXPERIENCE_TYPE_AREA } from '@/features/feature-switches/areas';
import { useActionGate, withLockHint, type ActionGate } from '@/shared/access/ActionControls';
import { AreaOffNote } from '@/shared/access/AreaOffNote';
import { useAccess } from '@/shared/access/useAccess';
import { PageHeader } from '@/shared/ui/custom/PageHeader';

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
  const [chosenType, setSelectedType] = useState<ExperienceType>(preselected);
  const { areaOn } = useAccess();
  const aiGate = useActionGate('ai-experiences.create');
  const searchGate = useActionGate('search-experiences.create');
  // A link straight to a kind this user can't create shows the choice instead of a wizard the
  // server would refuse at the end
  const allowedKind = (t: NonNullable<ExperienceType>) => (t === 'ai' ? aiGate : searchGate).state === 'allowed' && areaOn(EXPERIENCE_TYPE_AREA[t]);
  const selectedType: ExperienceType = chosenType && allowedKind(chosenType) ? chosenType : null;

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
        {areaOn('chat') ? <KindCard
          gate={aiGate}
          onSelect={() => setSelectedType('ai')}
          icon={<Bot className="size-7 text-indigo-500" />}
          iconClassName="bg-indigo-500/10 ring-indigo-500/20"
          hoverClassName="hover:border-indigo-500/30 hover:bg-indigo-500/[0.02]"
          linkClassName="text-indigo-600 dark:text-indigo-400"
          title="AI Experience"
          text="Build conversational AI assistants powered by tools and configurable pipelines. Great for chatbots, support agents, and interactive Q&A."
        /> : <AreaOffNote area="chat" className="rounded-2xl border border-dashed border-border/60 p-8" />}
        {areaOn('search') ? <KindCard
          gate={searchGate}
          onSelect={() => setSelectedType('search')}
          icon={<Compass className="size-7 text-violet-500" />}
          iconClassName="bg-violet-500/10 ring-violet-500/20"
          hoverClassName="hover:border-violet-500/30 hover:bg-violet-500/[0.02]"
          linkClassName="text-violet-600 dark:text-violet-400"
          title="Search Experience"
          text="Create search interfaces with multi-index support, AI summaries, and configurable result displays. Ideal for product search and knowledge bases."
        /> : <AreaOffNote area="search" className="rounded-2xl border border-dashed border-border/60 p-8" />}
      </div>
    </div>
  );
}

/** One kind to create; locked with the reason for a user who may not create it. */
function KindCard({ gate, onSelect, icon, iconClassName, hoverClassName, linkClassName, title, text }: {
  gate: ActionGate;
  onSelect: () => void;
  icon: ReactNode;
  iconClassName: string;
  hoverClassName: string;
  linkClassName: string;
  title: string;
  text: string;
}) {
  const locked = gate.state === 'locked';
  const card = (
    <button
      onClick={onSelect}
      disabled={gate.state !== 'allowed'}
      className={`group relative flex h-full w-full flex-col items-start text-left rounded-2xl border border-border/60 bg-card shadow-sm p-8 transition-all duration-200 disabled:opacity-60 ${locked ? '' : `hover:shadow-md ${hoverClassName}`}`}
    >
      <div className={`flex size-14 items-center justify-center rounded-xl ring-1 mb-5 ${iconClassName}`}>{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed mb-6">{text}</p>
      <div className={`mt-auto flex items-center gap-2 text-sm font-medium ${locked ? 'text-muted-foreground' : `${linkClassName} group-hover:gap-3`} transition-all`}>
        {locked ? <><Lock className="size-4" aria-hidden /> Locked</> : <>Get started <ArrowRight className="size-4" /></>}
      </div>
    </button>
  );
  return <>{withLockHint(gate, card, true)}</>;
}
