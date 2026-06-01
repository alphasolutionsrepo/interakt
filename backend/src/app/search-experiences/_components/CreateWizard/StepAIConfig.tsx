// app/search-experiences/_components/CreateWizard/StepAIConfig.tsx

/**
 * Step 3: AI Configuration
 *
 * - AI provider/model selection (optional)
 * - Summary settings
 */

'use client';

import { useCallback, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Brain,
  Sparkles,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { CustomInstructionsGenerator } from './CustomInstructionsGenerator';
import {
  type WizardFormData,
} from '@/features/search-experience/search-experience.client';

// ============================================================================
// TYPES
// ============================================================================

interface StepAIConfigProps {
  formData: WizardFormData;
  errors: Record<string, string>;
  updateField: <K extends keyof WizardFormData>(field: K, value: WizardFormData[K]) => void;
}

interface AIProvider {
  id: string;
  key: string;
  name: string;
  models: Array<{
    id: number;
    key: string;
    name: string;
    type: string;
  }>;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StepAIConfig({
  formData,
  errors,
  updateField,
}: StepAIConfigProps) {
  const { aiConfig } = formData;

  // State for custom instructions generator dialog
  const [showSummaryGenerator, setShowSummaryGenerator] = useState(false);

  // Get index IDs from formData for the generator
  const indexIds = formData.indexes.map((idx) => idx.searchIndexId);

  // Fetch AI providers
  const { data: providersData, isLoading: isLoadingProviders } = useQuery({
    queryKey: ['ai-providers'],
    queryFn: async () => {
      const response = await fetch('/api/ai-service/providers');
      const data = await response.json();
      return data.data || data;
    },
  });

  const providers: AIProvider[] = providersData?.providers || [];
  const selectedProvider = providers.find((p) => p.id === aiConfig.providerId);
  const chatModels = selectedProvider?.models.filter((m) => m.type === 'chat') || [];

  // Update AI config
  const updateAIConfig = useCallback(
    <K extends keyof WizardFormData['aiConfig']>(
      field: K,
      value: WizardFormData['aiConfig'][K]
    ) => {
      updateField('aiConfig', { ...aiConfig, [field]: value });
    },
    [aiConfig, updateField]
  );

  // Update summary config
  const updateSummaryConfig = useCallback(
    <K extends keyof WizardFormData['aiConfig']['summary']>(
      field: K,
      value: WizardFormData['aiConfig']['summary'][K]
    ) => {
      updateField('aiConfig', {
        ...aiConfig,
        summary: { ...aiConfig.summary, [field]: value },
      });
    },
    [aiConfig, updateField]
  );

  // Handle provider change
  const handleProviderChange = useCallback(
    (providerId: string) => {
      const provider = providers.find((p) => p.id === providerId);
      const defaultModel = provider?.models.find((m) => m.type === 'chat');

      updateField('aiConfig', {
        ...aiConfig,
        providerId: providerId || null,
        modelId: defaultModel?.id ?? null,
      });
    },
    [providers, aiConfig, updateField]
  );

  return (
    <div className="space-y-6">
      {/* AI Master Toggle */}
      <Card className="border-border/60 rounded-2xl">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Sparkles className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <Label htmlFor="aiEnabled" className="text-base font-medium">
                  Enable AI Features
                </Label>
                <p className="text-sm text-muted-foreground">
                  Enable AI-powered summaries
                </p>
              </div>
            </div>
            <Switch
              id="aiEnabled"
              checked={aiConfig.enabled}
              onCheckedChange={(checked) => updateAIConfig('enabled', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {aiConfig.enabled && (
        <>
          {/* AI Provider/Model Selection */}
          <Card className="border-border/60 rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4" />
                AI Provider
              </CardTitle>
              <CardDescription>
                Select the AI provider and model. Leave empty to use system defaults.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingProviders ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Provider</Label>
                    <Select
                      value={aiConfig.providerId || 'default'}
                      onValueChange={(value) => handleProviderChange(value === 'default' ? '' : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="System default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">System Default</SelectItem>
                        {providers.map((provider) => (
                          <SelectItem key={provider.id} value={provider.id}>
                            {provider.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select
                      value={aiConfig.modelId?.toString() || 'default'}
                      onValueChange={(value) =>
                        updateAIConfig('modelId', value === 'default' ? null : parseInt(value))
                      }
                      disabled={!selectedProvider}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        {chatModels.map((model) => (
                          <SelectItem key={model.id} value={model.id.toString()}>
                            {model.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary Configuration */}
          <Card className="border-border/60 rounded-2xl">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    AI Summary
                  </CardTitle>
                  <CardDescription>
                    Generate AI summaries of search results
                  </CardDescription>
                </div>
                <Switch
                  checked={aiConfig.summary.enabled}
                  onCheckedChange={(checked) => updateSummaryConfig('enabled', checked)}
                />
              </div>
            </CardHeader>
            {aiConfig.summary.enabled && (
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="maxResultsForContext">Search Results for Summary</Label>
                    <Input
                      id="maxResultsForContext"
                      type="number"
                      min={1}
                      max={50}
                      value={aiConfig.summary.maxResultsForContext}
                      onChange={(e) =>
                        updateSummaryConfig('maxResultsForContext', parseInt(e.target.value) || 10)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Max search results to include. Lower = faster/cheaper, higher = more comprehensive.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="summaryMaxTokens">Max Tokens</Label>
                    <Input
                      id="summaryMaxTokens"
                      type="number"
                      min={50}
                      max={4000}
                      value={aiConfig.summary.maxTokens || 500}
                      onChange={(e) =>
                        updateSummaryConfig('maxTokens', parseInt(e.target.value) || 500)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum length of generated summary
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="summaryCustomInstructions">Custom Instructions (Optional)</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSummaryGenerator(true)}
                      disabled={indexIds.length === 0}
                      className="gap-1.5 h-7 text-xs"
                    >
                      <Sparkles className="h-3 w-3" />
                      Generate with AI
                    </Button>
                  </div>
                  <Textarea
                    id="summaryCustomInstructions"
                    value={aiConfig.summary.customInstructions || ''}
                    onChange={(e) => updateSummaryConfig('customInstructions', e.target.value || undefined)}
                    placeholder="Add custom instructions for summary generation (e.g., tone, focus areas)..."
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    These instructions are added to the core summary behavior. Use to customize tone or focus areas.
                  </p>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Summary Instructions Generator Modal */}
          <CustomInstructionsGenerator
            open={showSummaryGenerator}
            onOpenChange={setShowSummaryGenerator}
            experienceName={formData.name}
            experienceDescription={formData.description}
            indexIds={indexIds}
            type="summary"
            currentInstructions={aiConfig.summary.customInstructions}
            onApply={(instructions) => updateSummaryConfig('customInstructions', instructions)}
          />

        </>
      )}
    </div>
  );
}
