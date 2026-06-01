// app/search-indexes/_components/ImportWizard/StepAIConfig.tsx

/**
 * Step 3: AI Configuration
 *
 * Select AI provider and embedding model for semantic/hybrid search.
 * Auto-populates from system defaults when available.
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Brain,
    Server,
    Sparkles,
    CheckCircle2,
} from 'lucide-react';
import { useAIProviders, useModelsForPurpose, useSystemDefaults } from '@/app/ai-providers/_lib/hooks/useAIProviders';

// ============================================================================
// TYPES
// ============================================================================

interface StepAIConfigProps {
    selectedProviderId: string;
    selectedModelId: number | null;
    embeddingDimensions: number | null;
    setAIConfig: (providerId: string, modelId: number | null, dimensions: number | null) => void;
    errors: Record<string, string>;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StepAIConfig({
    selectedProviderId,
    selectedModelId,
    embeddingDimensions,
    setAIConfig,
    errors,
}: StepAIConfigProps) {
    const hasAutoSelected = useRef(false);
    const [isUsingSystemDefault, setIsUsingSystemDefault] = useState(false);

    // Fetch data
    const { providers, isLoading: isLoadingProviders } = useAIProviders({ enabled: true });
    const { data: embeddingModels, isLoading: isLoadingModels } = useModelsForPurpose('embedding');
    const { resolved: systemDefaults, isLoading: isLoadingDefaults } = useSystemDefaults();

    // Derived data
    const enabledProviders = providers?.filter(p => p.isEnabled) || [];
    const availableModels = embeddingModels?.filter(m =>
        !selectedProviderId || m.provider.id === selectedProviderId
    ) || [];

    // Count embedding models per provider
    const getEmbeddingModelCount = useCallback((providerId: string) => {
        return embeddingModels?.filter(m => m.provider.id === providerId).length || 0;
    }, [embeddingModels]);

    const isLoading = isLoadingProviders || isLoadingModels || isLoadingDefaults;

    // ========================================================================
    // AUTO-SELECT FROM SYSTEM DEFAULTS
    // ========================================================================

    useEffect(() => {
        // Only run once, and only after data is loaded
        if (hasAutoSelected.current) return;
        if (isLoading) return;
        if (!enabledProviders.length || !embeddingModels?.length) return;

        // Skip if already has values
        if (selectedProviderId && selectedModelId) {
            hasAutoSelected.current = true;
            return;
        }

        let providerId: string | undefined;
        let modelId: number | undefined;
        let dimensions: number | undefined;
        let fromSystemDefault = false;

        // Priority 1: Use system defaults for embedding
        if (systemDefaults?.embedding?.providerId && systemDefaults?.embedding?.modelId) {
            const defaultProvider = enabledProviders.find(p => p.id === systemDefaults.embedding.providerId);
            const defaultModel = embeddingModels.find(m => m.id === systemDefaults.embedding.modelId);

            if (defaultProvider && defaultModel) {
                providerId = defaultProvider.id;
                modelId = defaultModel.id;
                dimensions = defaultModel.dimensions ?? undefined;
                fromSystemDefault = true;
            }
        }

        // Priority 2: Fall back to first enabled provider and its first embedding model
        if (!providerId || !modelId) {
            const firstProvider = enabledProviders[0];
            if (firstProvider) {
                providerId = firstProvider.id;
                const firstModel = embeddingModels.find(m => m.provider.id === firstProvider.id);
                if (firstModel) {
                    modelId = firstModel.id;
                    dimensions = firstModel.dimensions ?? undefined;
                }
            }
        }

        // Apply selections
        if (providerId && modelId && dimensions) {
            setAIConfig(providerId, modelId, dimensions);
            setIsUsingSystemDefault(fromSystemDefault);
            hasAutoSelected.current = true;
        }
    }, [
        isLoading,
        enabledProviders,
        embeddingModels,
        systemDefaults,
        selectedProviderId,
        selectedModelId,
        setAIConfig,
    ]);

    // ========================================================================
    // HANDLERS
    // ========================================================================

    const handleProviderChange = useCallback((value: string) => {
        setIsUsingSystemDefault(false);

        // When provider changes, auto-select first model for that provider
        if (value && embeddingModels) {
            const firstModel = embeddingModels.find(m => m.provider.id === value);
            if (firstModel) {
                setAIConfig(value, firstModel.id, firstModel.dimensions ?? null);
            } else {
                setAIConfig(value, null, null);
            }
        } else {
            setAIConfig(value, null, null);
        }
    }, [embeddingModels, setAIConfig]);

    const handleModelChange = useCallback((value: string) => {
        setIsUsingSystemDefault(false);
        const modelId = value ? parseInt(value) : null;

        if (modelId && embeddingModels) {
            const model = embeddingModels.find(m => m.id === modelId);
            setAIConfig(selectedProviderId, modelId, model?.dimensions ?? null);
        } else {
            setAIConfig(selectedProviderId, null, null);
        }
    }, [embeddingModels, selectedProviderId, setAIConfig]);

    // ========================================================================
    // RENDER
    // ========================================================================

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Brain className="h-6 w-6 text-primary" />
                <div>
                    <h3 className="font-semibold text-lg">AI Embedding Configuration</h3>
                    <p className="text-sm text-muted-foreground">
                        Configure the AI provider and model for generating embeddings.
                    </p>
                </div>
                {isUsingSystemDefault && (
                    <Badge
                        variant="outline"
                        className="ml-auto text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30"
                    >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Auto-configured
                    </Badge>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Provider Selection */}
                <div className="space-y-2">
                    <Label htmlFor="aiProviderId" className="text-sm font-medium">
                        AI Provider <span className="text-destructive">*</span>
                    </Label>
                    <Select
                        value={selectedProviderId || ''}
                        onValueChange={handleProviderChange}
                        disabled={isLoading}
                    >
                        <SelectTrigger
                            id="aiProviderId"
                            className={`h-11 rounded-xl transition-colors ${
                                errors.aiProviderId
                                    ? 'border-destructive focus-visible:ring-destructive/30'
                                    : 'focus-visible:border-primary focus-visible:ring-primary/20'
                            }`}
                        >
                            <SelectValue placeholder={isLoading ? 'Loading...' : 'Select provider'} />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                            {enabledProviders.map((provider) => {
                                const embeddingCount = getEmbeddingModelCount(provider.id);
                                return (
                                    <SelectItem
                                        key={provider.id}
                                        value={provider.id}
                                        className="rounded-lg"
                                    >
                                        <div className="flex items-center gap-2">
                                            {provider.providerType === 'local' ? (
                                                <Server className="h-4 w-4 text-muted-foreground" />
                                            ) : (
                                                <Sparkles className="h-4 w-4 text-violet-500" />
                                            )}
                                            <span className="font-medium">{provider.displayName}</span>
                                            <Badge variant="outline" className="text-xs ml-1 rounded-md">
                                                {embeddingCount}
                                            </Badge>
                                        </div>
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>
                    {errors.aiProviderId && (
                        <p className="text-sm text-destructive font-medium">{errors.aiProviderId}</p>
                    )}
                </div>

                {/* Model Selection */}
                <div className="space-y-2">
                    <Label htmlFor="aiModelId" className="text-sm font-medium">
                        Embedding Model <span className="text-destructive">*</span>
                    </Label>
                    <Select
                        value={selectedModelId?.toString() || ''}
                        onValueChange={handleModelChange}
                        disabled={!selectedProviderId || isLoading}
                    >
                        <SelectTrigger
                            id="aiModelId"
                            className={`h-11 rounded-xl transition-colors ${
                                errors.aiModelId
                                    ? 'border-destructive focus-visible:ring-destructive/30'
                                    : 'focus-visible:border-primary focus-visible:ring-primary/20'
                            }`}
                        >
                            <SelectValue placeholder={
                                isLoading
                                    ? 'Loading...'
                                    : !selectedProviderId
                                        ? 'Select provider first'
                                        : 'Select model'
                            } />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                            {availableModels.map((model) => (
                                <SelectItem
                                    key={model.id}
                                    value={model.id.toString()}
                                    className="rounded-lg"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{model.displayName}</span>
                                        {model.dimensions && (
                                            <Badge variant="outline" className="text-xs rounded-md">
                                                {model.dimensions}d
                                            </Badge>
                                        )}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {errors.aiModelId && (
                        <p className="text-sm text-destructive font-medium">{errors.aiModelId}</p>
                    )}
                </div>
            </div>

            {/* No providers warning */}
            {enabledProviders.length === 0 && !isLoading && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                    <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                        No AI providers enabled. Please configure providers in Settings → AI Providers.
                    </p>
                </div>
            )}

            {/* Selected Model Info */}
            {selectedModelId && embeddingDimensions && (
                <div className="p-4 bg-muted/30 rounded-xl">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Embedding Dimensions:</span>
                        <Badge variant="secondary" className="rounded-lg">
                            {embeddingDimensions} dimensions
                        </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        This determines the vector size for semantic search. All documents will be embedded using this model.
                    </p>
                </div>
            )}
        </div>
    );
}
