// app/playground/unified-search/_components/UnifiedSearchPlayground.tsx

'use client';

/**
 * Unified Search Playground
 *
 * Modern, elegant interface for testing Search Experience features.
 * Card-based selection with smooth transitions to feature panels.
 */

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Sparkles,
  Brain,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  Layers,
  Key,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { SearchPanel } from './SearchPanel';
import { SummaryPanel } from './SummaryPanel';

// ============================================================================
// TYPES
// ============================================================================

type PlaygroundTab = 'search' | 'summary';

interface SearchExperienceOption {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  aiEnabled: boolean;
  indexCount: number;
}

// ============================================================================
// FEATURE CARDS CONFIG
// ============================================================================

interface FeatureConfig {
  id: PlaygroundTab;
  title: string;
  description: string;
  icon: typeof Search;
  gradient: string;
  borderColor: string;
  iconColor: string;
  hoverBg: string;
  requiresAI?: boolean;
  disabled?: boolean;
}

const FEATURES: FeatureConfig[] = [
  {
    id: 'search',
    title: 'Search',
    description: 'Execute multi-index searches with filters, facets, and highlighting',
    icon: Search,
    gradient: 'from-blue-500/20 to-cyan-500/20',
    borderColor: 'border-blue-500/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
    hoverBg: 'hover:bg-blue-500/5',
  },
  {
    id: 'summary',
    title: 'AI Summary',
    description: 'Generate intelligent summaries from search results using AI',
    icon: Brain,
    gradient: 'from-violet-500/20 to-purple-500/20',
    borderColor: 'border-violet-500/20',
    iconColor: 'text-violet-600 dark:text-violet-400',
    hoverBg: 'hover:bg-violet-500/5',
    requiresAI: true,
  },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function UnifiedSearchPlayground({ hideHeader = false }: { hideHeader?: boolean } = {}) {
  // State
  const [selectedExperienceId, setSelectedExperienceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PlaygroundTab>('search');
  const [showPanel, setShowPanel] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Fetch search experiences
  const {
    data: experiencesData,
    isLoading: isLoadingExperiences,
    error: experiencesError,
    refetch,
  } = useQuery({
    queryKey: ['search-experiences', 'playground'],
    queryFn: async () => {
      const response = await fetch('/api/search-experiences?pageSize=100&isActive=true');
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to fetch');
      return json.data as SearchExperienceOption[];
    },
  });

  // Fetch selected experience details (for access token)
  const { data: selectedExperience } = useQuery({
    queryKey: ['search-experience', selectedExperienceId],
    queryFn: async () => {
      const response = await fetch(`/api/search-experiences/${selectedExperienceId}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to fetch');
      return json.data;
    },
    enabled: !!selectedExperienceId,
  });

  // Auto-select first experience
  useEffect(() => {
    if (experiencesData?.length && !selectedExperienceId) {
      setSelectedExperienceId(experiencesData[0].id);
    }
  }, [experiencesData, selectedExperienceId]);

  // Get selected experience from list
  const selectedOption = useMemo(() => {
    return experiencesData?.find((e) => e.id === selectedExperienceId);
  }, [experiencesData, selectedExperienceId]);

  // Filter available features based on experience config
  const availableFeatures = useMemo(() => {
    if (!selectedOption) return FEATURES;
    return FEATURES.map((f) => ({
      ...f,
      disabled: f.requiresAI && !selectedOption.aiEnabled,
    }));
  }, [selectedOption]);

  // Handle feature select
  const handleFeatureSelect = (tab: PlaygroundTab) => {
    const feature = availableFeatures.find((f) => f.id === tab);
    if (feature?.disabled) {
      toast.error('AI Summary is not enabled for this experience');
      return;
    }
    setActiveTab(tab);
    setShowPanel(true);
  };

  // Handle back
  const handleBack = () => {
    setShowPanel(false);
  };

  // Copy access token
  const handleCopyToken = async () => {
    if (selectedExperience?.accessToken) {
      await navigator.clipboard.writeText(selectedExperience.accessToken);
      setCopiedToken(true);
      toast.success('Access token copied to clipboard');
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  // Get current feature
  const currentFeature = FEATURES.find((f) => f.id === activeTab);

  // Error state
  if (experiencesError) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <Card className="max-w-md w-full p-6">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="p-3 rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Failed to load experiences</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Please check if any search experiences are configured.
              </p>
            </div>
            <Button onClick={() => refetch()} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoadingExperiences) {
    return (
      <div className="h-full flex flex-col">
        <header className={`shrink-0 border-b bg-background ${hideHeader ? 'hidden' : ''}`}>
          <div className="px-6 py-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-64" />
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6">
          <div className="max-w-4xl mx-auto grid gap-4 md:grid-cols-2">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </main>
      </div>
    );
  }

  // No experiences state
  if (!experiencesData?.length) {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <header className={`shrink-0 border-b bg-background ${hideHeader ? 'hidden' : ''}`}>
          <div className="px-6 py-4 lg:px-8">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/20 shadow-sm">
                <Sparkles className="size-7 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="space-y-1">
                <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">Experience Search</h1>
                <p className="text-sm text-muted-foreground max-w-2xl">
                  Simulate your app&apos;s public search API with multi-index search and AI summaries.
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Empty State */}
        <main className="flex-1 flex items-center justify-center p-12">
          <div className="max-w-2xl w-full">
            <div className="flex flex-col items-center text-center">
              {/* Icon */}
              <div className="relative mb-10">
                {/* Icon glow */}
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-violet-500/15 via-purple-500/10 to-transparent blur-xl opacity-60" />

                {/* Icon container */}
                <div className="relative flex size-32 items-center justify-center rounded-3xl bg-gradient-to-br from-background/80 to-muted/50 ring-1 ring-border/50 shadow-2xl">
                  <Layers className="size-16 text-violet-500" />
                </div>
              </div>

              {/* Title */}
              <h2 className="text-5xl font-semibold tracking-tight mb-5">
                No Search Experiences Yet
              </h2>
              <p className="text-xl text-muted-foreground mb-12 max-w-lg">
                Create a search experience to test unified search and AI summaries
              </p>

              {/* CTA Button */}
              <Button size="lg" className="h-14 px-8 gap-2 text-base font-bold shadow-lg" asChild>
                <a href="/experiences/create?type=search">
                  <Sparkles className="size-5" />
                  Create Search Experience
                </a>
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Panel view
  if (showPanel && selectedExperienceId && selectedOption) {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <header className={`shrink-0 border-b bg-background ${hideHeader ? 'hidden' : ''}`}>
          <div className="px-6 py-4 lg:px-8">
            <div className="flex items-center justify-between">
              {/* Back & Title */}
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0 size-10 rounded-xl">
                  <ArrowLeft className="size-5" />
                </Button>
                <div className="flex items-center gap-4">
                  {currentFeature && (
                    <div
                      className={cn(
                        'p-3 rounded-xl bg-gradient-to-br border shadow-sm',
                        currentFeature.gradient,
                        currentFeature.borderColor
                      )}
                    >
                      <currentFeature.icon className={cn('size-7', currentFeature.iconColor)} />
                    </div>
                  )}
                  <div className="space-y-1">
                    <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">{currentFeature?.title}</h1>
                    <p className="text-sm text-muted-foreground">{currentFeature?.description}</p>
                  </div>
                </div>
              </div>

              {/* Experience Selector */}
              <div className="flex items-center gap-3">
                <Select value={selectedExperienceId} onValueChange={setSelectedExperienceId}>
                  <SelectTrigger className="w-64 h-9">
                    <SelectValue placeholder="Select experience" />
                  </SelectTrigger>
                  <SelectContent>
                    {experiencesData.map((exp) => (
                      <SelectItem key={exp.id} value={exp.id}>
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                          <span>{exp.name}</span>
                          {exp.indexCount > 0 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {exp.indexCount} index{exp.indexCount !== 1 ? 'es' : ''}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Access Token Button */}
                {selectedExperience?.accessToken && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyToken}
                    className="gap-2 h-9"
                  >
                    {copiedToken ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Key className="h-3.5 w-3.5" />
                    )}
                    {copiedToken ? 'Copied!' : 'Token'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Panel Content */}
        <main className="flex-1 min-h-0 overflow-hidden">
          {activeTab === 'search' && (
            <SearchPanel
              experienceId={selectedExperienceId}
              slug={selectedOption.slug}
              accessToken={selectedExperience?.accessToken}
            />
          )}
          {activeTab === 'summary' && (
            <SummaryPanel
              experienceId={selectedExperienceId}
              slug={selectedOption.slug}
              accessToken={selectedExperience?.accessToken}
            />
          )}
        </main>
      </div>
    );
  }

  // Selection screen
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className={`shrink-0 border-b bg-background ${hideHeader ? 'hidden' : ''}`}>
        <div className="px-6 py-4 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/20 shadow-sm">
                <Sparkles className="size-7 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="space-y-1">
                <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">Experience Search</h1>
                <p className="text-sm text-muted-foreground max-w-2xl">
                  Simulate your app&apos;s public search API with multi-index search and AI summaries.
                </p>
              </div>
            </div>

            {/* Experience Selector */}
            <Select value={selectedExperienceId || ''} onValueChange={setSelectedExperienceId}>
              <SelectTrigger className="w-72 h-9">
                <SelectValue placeholder="Select a search experience" />
              </SelectTrigger>
              <SelectContent>
                {experiencesData.map((exp) => (
                  <SelectItem key={exp.id} value={exp.id}>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                      <span>{exp.name}</span>
                      <div className="flex items-center gap-1 ml-2">
                        {exp.aiEnabled && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            AI
                          </Badge>
                        )}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {/* Selection Cards */}
      <main className="flex-1 overflow-auto">
        <div className="h-full flex items-center justify-center p-8">
          <div className="max-w-2xl w-full space-y-6">

            {/* Section label */}
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60 text-center">
              Test your search experience
            </p>

            {/* Feature cards */}
            <div className="grid gap-3 md:grid-cols-2">
              {availableFeatures.map((feature) => {
                const Icon = feature.icon;
                const isDisabled = feature.disabled;

                return (
                  <Card
                    key={feature.id}
                    className={cn(
                      'relative transition-all duration-200 border border-border/60',
                      isDisabled
                        ? 'opacity-40 cursor-not-allowed'
                        : 'cursor-pointer hover:border-border hover:shadow-md hover:bg-muted/30'
                    )}
                    onClick={() => !isDisabled && handleFeatureSelect(feature.id)}
                  >
                    <CardContent className="p-5">
                      <div className="flex flex-col items-center text-center gap-3">
                        <div
                          className={cn(
                            'p-2.5 rounded-xl bg-linear-to-br border',
                            feature.gradient,
                            feature.borderColor
                          )}
                        >
                          <Icon className={cn('size-5', feature.iconColor)} />
                        </div>
                        <div className="space-y-1">
                          <h3 className="font-semibold text-sm">{feature.title}</h3>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {feature.description}
                          </p>
                        </div>
                        {isDisabled && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Not enabled
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Selected experience info */}
            {selectedOption && (
              <p className="text-xs text-muted-foreground text-center">
                Testing with <span className="font-medium text-foreground">{selectedOption.name}</span>
                {selectedOption.indexCount > 0 && (
                  <> · {selectedOption.indexCount} connected index{selectedOption.indexCount !== 1 ? 'es' : ''}</>
                )}
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
