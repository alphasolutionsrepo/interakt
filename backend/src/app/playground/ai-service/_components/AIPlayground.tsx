// app/playground/ai-service/_components/AIPlayground.tsx

'use client';

/**
 * AI Service Playground
 *
 * Modern, spacious interface for testing AI capabilities.
 * Features a card-based selection screen with smooth transitions.
 */

import { useMemo, useEffect } from 'react';
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
  Bot,
  MessageSquare,
  Binary,
  AlertCircle,
  Sparkles,
  Cloud,
  Server,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { useAIProviders, usePlaygroundState, type PlaygroundTab } from '../_lib/hooks/useAIPlayground';
import { TextGenerationPanel } from './TextGenerationPanel';
import { ChatPanel } from './ChatPanel';
import { EmbeddingsPanel } from './EmbeddingsPanel';

// Feature card configuration
const FEATURES = [
  {
    id: 'text' as PlaygroundTab,
    title: 'Text Generation',
    description: 'Generate text completions from prompts with customizable parameters',
    icon: Bot,
    gradient: 'from-blue-500/20 to-cyan-500/20',
    borderColor: 'border-blue-500/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
    hoverBg: 'hover:bg-blue-500/5',
  },
  {
    id: 'chat' as PlaygroundTab,
    title: 'Chat',
    description: 'Have interactive conversations with AI using a chat interface',
    icon: MessageSquare,
    gradient: 'from-violet-500/20 to-purple-500/20',
    borderColor: 'border-violet-500/20',
    iconColor: 'text-violet-600 dark:text-violet-400',
    hoverBg: 'hover:bg-violet-500/5',
  },
  {
    id: 'embeddings' as PlaygroundTab,
    title: 'Embeddings',
    description: 'Generate vector embeddings for text to use in search and similarity',
    icon: Binary,
    gradient: 'from-emerald-500/20 to-teal-500/20',
    borderColor: 'border-emerald-500/20',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    hoverBg: 'hover:bg-emerald-500/5',
  },
];

export function AIPlayground() {
  const { data: providersData, isLoading: isLoadingProviders, error: providersError, refetch } = useAIProviders();
  const playgroundState = usePlaygroundState();

  // Check if we're in loading or pending auto-selection state
  const isPendingAutoSelection = !isLoadingProviders && providersData && !playgroundState.selectedProvider;

  // Find selected provider and model details
  const selectedProviderData = useMemo(() => {
    if (!providersData?.providers || !playgroundState.selectedProvider) return null;
    return providersData.providers.find(p => p.id === playgroundState.selectedProvider);
  }, [providersData?.providers, playgroundState.selectedProvider]);

  // Filter models based on active tab
  const filteredModels = useMemo(() => {
    if (!selectedProviderData) return [];
    const modelTypeMap: Record<PlaygroundTab, string[]> = {
      text: ['text', 'chat', 'text_generation'],
      chat: ['chat', 'text'],
      embeddings: ['embedding', 'embeddings'],
    };
    const allowedTypes = modelTypeMap[playgroundState.activeTab];
    return selectedProviderData.models.filter(m =>
      allowedTypes.some(t => m.type.toLowerCase().includes(t))
    );
  }, [selectedProviderData, playgroundState.activeTab]);

  // Get the default config for a specific tab
  const getDefaultForTab = (tab: PlaygroundTab) => {
    if (!providersData?.defaults) return null;
    switch (tab) {
      case 'text':
        return providersData.defaults.textGeneration;
      case 'chat':
        return providersData.defaults.chat;
      case 'embeddings':
        return providersData.defaults.embedding;
    }
  };

  // Initialize with defaults when data loads
  useEffect(() => {
    if (providersData?.defaults && !playgroundState.selectedProvider) {
      const defaultConfig = getDefaultForTab(playgroundState.activeTab);
      if (defaultConfig) {
        playgroundState.setSelectedProvider(defaultConfig.providerId);
        playgroundState.setSelectedModel(defaultConfig.modelId);
      } else if (providersData.providers.length > 0) {
        const firstProvider = providersData.providers[0];
        playgroundState.setSelectedProvider(firstProvider.id);
        if (firstProvider.models.length > 0) {
          playgroundState.setSelectedModel(firstProvider.models[0].id);
        }
      }
    }
  }, [providersData]);

  // Handle feature card click - sets tab and navigates to panel
  const handleFeatureSelect = (tab: PlaygroundTab) => {
    playgroundState.setActiveTab(tab);
    playgroundState.setShowPanel(true);

    // Get the default for this tab type
    const defaultConfig = getDefaultForTab(tab);
    if (defaultConfig) {
      playgroundState.setSelectedProvider(defaultConfig.providerId);
      playgroundState.setSelectedModel(defaultConfig.modelId);
    } else if (providersData?.providers.length) {
      // Fallback: find first provider with compatible model
      const modelTypeMap: Record<PlaygroundTab, string[]> = {
        text: ['text', 'chat', 'text_generation'],
        chat: ['chat', 'text'],
        embeddings: ['embedding', 'embeddings'],
      };
      const allowedTypes = modelTypeMap[tab];

      for (const provider of providersData.providers) {
        const compatibleModel = provider.models.find(m =>
          allowedTypes.some(t => m.type.toLowerCase().includes(t))
        );
        if (compatibleModel) {
          playgroundState.setSelectedProvider(provider.id);
          playgroundState.setSelectedModel(compatibleModel.id);
          break;
        }
      }
    }
  };

  // Handle provider change - auto-select first compatible model
  const handleProviderChange = (providerId: string) => {
    playgroundState.setSelectedProvider(providerId);
    const provider = providersData?.providers.find(p => p.id === providerId);
    if (provider) {
      const modelTypeMap: Record<PlaygroundTab, string[]> = {
        text: ['text', 'chat', 'text_generation'],
        chat: ['chat', 'text'],
        embeddings: ['embedding', 'embeddings'],
      };
      const allowedTypes = modelTypeMap[playgroundState.activeTab];
      const compatibleModel = provider.models.find(m =>
        allowedTypes.some(t => m.type.toLowerCase().includes(t))
      );
      if (compatibleModel) {
        playgroundState.setSelectedModel(compatibleModel.id);
      }
    }
  };

  // Handle back to selection screen
  const handleBack = () => {
    playgroundState.setShowPanel(false);
  };

  // Get current feature config
  const currentFeature = FEATURES.find(f => f.id === playgroundState.activeTab);

  // Error state
  if (providersError) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <Card className="max-w-md w-full p-6">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="p-3 rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Failed to load providers</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Please check your AI provider configuration.
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

  // Loading state - show skeleton
  if (isLoadingProviders || isPendingAutoSelection) {
    return (
      <div className="h-full flex flex-col">
        <header className="shrink-0 border-b bg-background">
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
          <div className="max-w-4xl mx-auto grid gap-4 md:grid-cols-3">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </main>
      </div>
    );
  }

  // Show panel view when a feature is selected
  if (playgroundState.showPanel) {
    return (
      <div className="h-full flex flex-col">
        {/* Header with back button and model selectors */}
        <header className="shrink-0 border-b bg-background">
          <div className="px-6 py-4 lg:px-8">
            <div className="flex items-center justify-between">
              {/* Back button and title */}
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBack}
                  className="shrink-0 size-9 rounded-xl"
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <div className="flex items-center gap-3">
                  {currentFeature && (
                    <div className={cn(
                      "p-2 rounded-lg bg-gradient-to-br border shadow-sm",
                      currentFeature.gradient,
                      currentFeature.borderColor
                    )}>
                      <currentFeature.icon className={cn("size-5", currentFeature.iconColor)} />
                    </div>
                  )}
                  <div className="space-y-0.5">
                    <h1 className="text-lg font-bold tracking-tight">
                      {currentFeature?.title || 'AI Provider'}
                    </h1>
                    <p className="text-xs text-muted-foreground">
                      {currentFeature?.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Provider & Model Selectors */}
              <div className="flex items-center gap-3">
                {providersData && (
                  <>
                    {/* Provider Select */}
                    <Select
                      value={playgroundState.selectedProvider || ''}
                      onValueChange={handleProviderChange}
                    >
                      <SelectTrigger className="w-44 h-9">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {providersData.providers.map((provider) => (
                          <SelectItem key={provider.id} value={provider.id}>
                            <div className="flex items-center gap-2">
                              {provider.type === 'cloud' ? (
                                <Cloud className="h-3.5 w-3.5 text-blue-500" />
                              ) : (
                                <Server className="h-3.5 w-3.5 text-green-500" />
                              )}
                              <span>{provider.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Model Select */}
                    <Select
                      value={playgroundState.selectedModel?.toString() || ''}
                      onValueChange={(v) => playgroundState.setSelectedModel(parseInt(v, 10))}
                      disabled={!selectedProviderData || filteredModels.length === 0}
                    >
                      <SelectTrigger className="w-52 h-9">
                        <SelectValue placeholder={
                          !selectedProviderData
                            ? 'Select provider first'
                            : filteredModels.length === 0
                              ? 'No compatible models'
                              : 'Select model'
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredModels.map((model) => (
                          <SelectItem key={model.id} value={model.id.toString()}>
                            <div className="flex items-center gap-2">
                              <span>{model.name}</span>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {model.type}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Panel Content */}
        <main className="flex-1 min-h-0 overflow-hidden">
          {playgroundState.activeTab === 'text' && (
            <TextGenerationPanel
              providerId={playgroundState.selectedProvider}
              modelId={playgroundState.selectedModel}
              temperature={playgroundState.temperature}
              maxTokens={playgroundState.maxTokens}
              topP={playgroundState.topP}
              systemPrompt={playgroundState.systemPrompt}
              onTemperatureChange={playgroundState.setTemperature}
              onMaxTokensChange={playgroundState.setMaxTokens}
              onSystemPromptChange={playgroundState.setSystemPrompt}
            />
          )}
          {playgroundState.activeTab === 'chat' && (
            <ChatPanel
              providerId={playgroundState.selectedProvider}
              modelId={playgroundState.selectedModel}
              temperature={playgroundState.temperature}
              maxTokens={playgroundState.maxTokens}
              topP={playgroundState.topP}
              systemPrompt={playgroundState.systemPrompt}
              onTemperatureChange={playgroundState.setTemperature}
              onMaxTokensChange={playgroundState.setMaxTokens}
              onSystemPromptChange={playgroundState.setSystemPrompt}
            />
          )}
          {playgroundState.activeTab === 'embeddings' && (
            <EmbeddingsPanel
              providerId={playgroundState.selectedProvider}
              modelId={playgroundState.selectedModel}
            />
          )}
        </main>
      </div>
    );
  }

  // Selection screen - card-based layout
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="shrink-0 border-b bg-background">
        <div className="px-6 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/20 shadow-sm">
              <Sparkles className="size-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="space-y-0.5">
              <h1 className="text-xl font-bold tracking-tight">AI Provider</h1>
              <p className="text-sm text-muted-foreground">
                Test text generation, chat, and embedding capabilities.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Selection Cards */}
      <main className="flex-1 overflow-auto">
        <div className="h-full flex items-center justify-center p-6">
          <div className="max-w-4xl w-full">
            {/* Feature cards */}
            <div className="grid gap-6 md:grid-cols-3">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.id} className="group/card relative">
                    {/* Card glow on hover */}
                    <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-primary/20 via-primary/10 to-transparent opacity-0 blur-xl transition-all duration-500 group-hover/card:opacity-100" />

                    {/* Card content */}
                    <Card
                      className={cn(
                        "relative cursor-pointer transition-all duration-300 h-full",
                        "border border-border/60 bg-card/80 backdrop-blur-sm",
                        "hover:border-border hover:bg-card hover:shadow-lg"
                      )}
                      onClick={() => handleFeatureSelect(feature.id)}
                    >
                      <CardContent className="p-6 h-full">
                        <div className="flex flex-col items-center text-center space-y-4 h-full">
                          {/* Icon */}
                          <div className={cn(
                            "p-3 rounded-xl bg-gradient-to-br border shadow-sm",
                            feature.gradient,
                            feature.borderColor
                          )}>
                            <Icon className={cn("size-6", feature.iconColor)} />
                          </div>

                          {/* Title and description */}
                          <div className="space-y-1.5 flex-1">
                            <h3 className="font-semibold text-base">{feature.title}</h3>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {feature.description}
                            </p>
                          </div>

                          {/* CTA */}
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary pt-1">
                            Get started
                            <ArrowRight className="size-3.5 transition-transform group-hover/card:translate-x-1" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>

            {/* Provider info */}
            {providersData && providersData.providers.length > 0 && (
              <div className="mt-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {providersData.providers.length} AI provider{providersData.providers.length !== 1 ? 's' : ''} configured
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
