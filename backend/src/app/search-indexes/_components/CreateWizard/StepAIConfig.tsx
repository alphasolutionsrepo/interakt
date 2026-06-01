// app/search-indexes/_components/CreateWizard/StepAIConfig.tsx

/**
 * Step 3: AI Configuration
 *
 * Only shown for semantic/hybrid search types.
 *
 * Collects:
 * - AI Provider selection
 * - Embedding Model selection
 * - Vector similarity metric
 *
 * Note: RRF/hybrid tuning settings are now configured at Search Experience level.
 *
 * Features:
 * - Auto-selects from system defaults when available
 * - Shows "System Default" badge for auto-selected values
 * - No premature validation - errors only show after user attempts to proceed
 */

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    ChevronDown,
    Brain,
    Server,
    Sparkles,
    CheckCircle2,
    Settings2,
} from 'lucide-react';
import { useAIProviders, useModelsForPurpose, useSystemDefaults } from '@/app/ai-providers/_lib/hooks/useAIProviders';
import { VECTOR_SIMILARITY_INFO } from '@/features/search-index';
import type { WizardFormData } from '@/features/search-index/search-index.wizard-schemas';

// ============================================================================
// TYPES
// ============================================================================

interface StepAIConfigProps {
    formData: WizardFormData;
    errors: Record<string, string>;
    updateField: <K extends keyof WizardFormData>(field: K, value: WizardFormData[K]) => void;
    updateFieldBulk: (updates: Partial<WizardFormData>) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StepAIConfig({ formData, errors, updateField, updateFieldBulk }: StepAIConfigProps) {
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const hasAutoSelected = useRef(false);
    const [isUsingSystemDefault, setIsUsingSystemDefault] = useState(false);

    // Current values
    const searchType = formData.searchType;
    const aiProviderId = formData.aiProviderId;
    const aiModelId = formData.aiModelId;
    const vectorSimilarity = formData.vectorSimilarity || 'cosine';

    // Fetch data
    const { providers, isLoading: isLoadingProviders } = useAIProviders({ enabled: true });
    const { data: embeddingModels, isLoading: isLoadingModels } = useModelsForPurpose('embedding');
    const { resolved: systemDefaults, isLoading: isLoadingDefaults } = useSystemDefaults();

    // Derived data
    const enabledProviders = providers?.filter(p => p.isEnabled) || [];
    const availableModels = embeddingModels?.filter(m =>
        !aiProviderId || m.provider.id === aiProviderId
    ) || [];

    // Count embedding models per provider
    const getEmbeddingModelCount = (providerId: string) => {
        return embeddingModels?.filter(m => m.provider.id === providerId).length || 0;
    };

    const isLoading = isLoadingProviders || isLoadingModels || isLoadingDefaults;
    const isHybrid = searchType === 'hybrid';

    // ========================================================================
    // AUTO-SELECT FROM SYSTEM DEFAULTS
    // ========================================================================

    useEffect(() => {
        // Only run once, and only after data is loaded
        if (hasAutoSelected.current) return;
        if (isLoading) return;
        if (!enabledProviders.length || !embeddingModels?.length) return;
        
        // Skip if already has values (e.g., navigated back from later step)
        if (aiProviderId && aiModelId) {
            hasAutoSelected.current = true;
            return;
        }

        let selectedProviderId: string | undefined;
        let selectedModelId: number | undefined;
        let selectedDimensions: number | undefined;
        let fromSystemDefault = false;

        // Priority 1: Use system defaults for embedding
        if (systemDefaults?.embedding?.providerId && systemDefaults?.embedding?.modelId) {
            const defaultProvider = enabledProviders.find(p => p.id === systemDefaults.embedding.providerId);
            const defaultModel = embeddingModels.find(m => m.id === systemDefaults.embedding.modelId);
            
            if (defaultProvider && defaultModel) {
                selectedProviderId = defaultProvider.id;
                selectedModelId = defaultModel.id;
                selectedDimensions = defaultModel.dimensions ?? undefined;
                fromSystemDefault = true;
            }
        }

        // Priority 2: Fall back to first enabled provider and its first embedding model
        if (!selectedProviderId || !selectedModelId) {
            const firstProvider = enabledProviders[0];
            if (firstProvider) {
                selectedProviderId = firstProvider.id;
                const firstModel = embeddingModels.find(m => m.provider.id === firstProvider.id);
                if (firstModel) {
                    selectedModelId = firstModel.id;
                    selectedDimensions = firstModel.dimensions ?? undefined;
                }
            }
        }

        // Apply selections
        if (selectedProviderId && selectedModelId && selectedDimensions) {
            updateFieldBulk({
                aiProviderId: selectedProviderId,
                aiModelId: selectedModelId,
                embeddingDimensions: selectedDimensions,
            });
            setIsUsingSystemDefault(fromSystemDefault);
            hasAutoSelected.current = true;
        }
    }, [
        isLoading,
        enabledProviders,
        embeddingModels,
        systemDefaults,
        aiProviderId,
        aiModelId,
        updateFieldBulk,
    ]);

    // ========================================================================
    // HANDLERS
    // ========================================================================

    const handleProviderChange = useCallback((value: string) => {
        setIsUsingSystemDefault(false);
        updateField('aiProviderId', value || undefined);
        
        // When provider changes, auto-select first model for that provider
        if (value && embeddingModels) {
            const firstModel = embeddingModels.find(m => m.provider.id === value);
            if (firstModel) {
                updateFieldBulk({
                    aiProviderId: value,
                    aiModelId: firstModel.id,
                    embeddingDimensions: firstModel.dimensions ?? undefined,
                });
            } else {
                // No models for this provider
                updateFieldBulk({
                    aiProviderId: value,
                    aiModelId: undefined,
                    embeddingDimensions: undefined,
                });
            }
        }
    }, [embeddingModels, updateField, updateFieldBulk]);

    const handleModelChange = useCallback((value: string) => {
        setIsUsingSystemDefault(false);
        const modelId = value ? parseInt(value) : undefined;
        
        if (modelId && embeddingModels) {
            const model = embeddingModels.find(m => m.id === modelId);
            updateFieldBulk({
                aiModelId: modelId,
                embeddingDimensions: model?.dimensions ?? undefined,
            });
        } else {
            updateFieldBulk({
                aiModelId: undefined,
                embeddingDimensions: undefined,
            });
        }
    }, [embeddingModels, updateFieldBulk]);

    // ========================================================================
    // RENDER - NOT SEMANTIC/HYBRID
    // ========================================================================

    if (searchType !== 'semantic' && searchType !== 'hybrid') {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                    <Brain className="h-8 w-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">
                    AI Configuration Not Required
                </h3>
                <p className="text-slate-500 max-w-md">
                    You&apos;ve selected <strong>Lexical</strong> search, which uses traditional 
                    text matching and doesn&apos;t require AI embeddings. You can proceed to create 
                    your search index.
                </p>
            </div>
        );
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    const getVectorSimilarityColors = (similarity: 'cosine' | 'euclidean' | 'dot_product', isSelected: boolean) => {
        if (!isSelected) {
            return {
                bg: 'bg-card hover:bg-muted/50',
                border: 'border-border/60',
                text: 'text-foreground',
                desc: 'text-muted-foreground',
            };
        }

        switch (similarity) {
            case 'cosine':
                return {
                    bg: 'bg-teal-500/10',
                    border: 'border-teal-500/50 ring-2 ring-teal-500/20',
                    text: 'text-teal-600 dark:text-teal-400',
                    desc: 'text-teal-600/80 dark:text-teal-400/80',
                };
            case 'euclidean':
                return {
                    bg: 'bg-indigo-500/10',
                    border: 'border-indigo-500/50 ring-2 ring-indigo-500/20',
                    text: 'text-indigo-600 dark:text-indigo-400',
                    desc: 'text-indigo-600/80 dark:text-indigo-400/80',
                };
            case 'dot_product':
                return {
                    bg: 'bg-rose-500/10',
                    border: 'border-rose-500/50 ring-2 ring-rose-500/20',
                    text: 'text-rose-600 dark:text-rose-400',
                    desc: 'text-rose-600/80 dark:text-rose-400/80',
                };
        }
    };

    // ========================================================================
    // RENDER - SEMANTIC/HYBRID
    // ========================================================================

    return (
        <div className="space-y-6">
            {/* Provider and Model Selection Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <Label className="text-base font-semibold text-foreground">AI Embedding Configuration</Label>
                    {isUsingSystemDefault && (
                        <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Auto-configured
                        </Badge>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Provider Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="aiProviderId" className="text-sm font-medium text-muted-foreground">
                            Provider <span className="text-destructive">*</span>
                        </Label>
                        <Select
                            value={aiProviderId || ''}
                            onValueChange={handleProviderChange}
                            disabled={isLoading}
                        >
                            <SelectTrigger className={`h-11 rounded-xl transition-colors ${
                                errors.aiProviderId
                                    ? 'border-destructive focus-visible:ring-destructive/30'
                                    : 'focus-visible:border-primary focus-visible:ring-primary/20'
                            }`}>
                                <SelectValue placeholder={isLoading ? 'Loading...' : 'Select provider'} />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                                {enabledProviders.map((provider) => {
                                    const embeddingCount = getEmbeddingModelCount(provider.id);
                                    return (
                                        <SelectItem key={provider.id} value={provider.id} className="rounded-lg">
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
                        <Label htmlFor="aiModelId" className="text-sm font-medium text-muted-foreground">
                            Embedding Model <span className="text-destructive">*</span>
                        </Label>
                        <Select
                            value={aiModelId?.toString() || ''}
                            onValueChange={handleModelChange}
                            disabled={!aiProviderId || isLoading}
                        >
                            <SelectTrigger className={`h-11 rounded-xl transition-colors ${
                                errors.aiModelId
                                    ? 'border-destructive focus-visible:ring-destructive/30'
                                    : 'focus-visible:border-primary focus-visible:ring-primary/20'
                            }`}>
                                <SelectValue placeholder={
                                    isLoading
                                        ? 'Loading...'
                                        : !aiProviderId
                                            ? 'Select provider first'
                                            : 'Select model'
                                } />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                                {availableModels.map((model) => (
                                    <SelectItem key={model.id} value={model.id.toString()} className="rounded-lg">
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
                    <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                        No AI providers enabled. Configure in Settings → AI Providers.
                    </p>
                )}
            </div>

            {/* Advanced Settings */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        type="button"
                        className="flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 p-2 -ml-2 h-auto rounded-lg"
                    >
                        <Settings2 className="h-4 w-4" />
                        <span className="font-medium">Advanced Settings</span>
                        <span className="text-xs text-muted-foreground/70 ml-1">
                            ({VECTOR_SIMILARITY_INFO[vectorSimilarity]?.label || 'Cosine'})
                        </span>
                        <ChevronDown className={`h-4 w-4 ml-1 transition-transform duration-200 ${advancedOpen ? 'rotate-180' : ''}`} />
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 space-y-6">
                    {/* Vector Similarity */}
                    <div className="space-y-3">
                        <Label className="text-sm font-medium text-muted-foreground">Vector Similarity Metric</Label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {(['cosine', 'euclidean', 'dot_product'] as const).map((similarity) => {
                                const info = VECTOR_SIMILARITY_INFO[similarity];
                                const isSelected = vectorSimilarity === similarity;
                                const colors = getVectorSimilarityColors(similarity, isSelected);

                                return (
                                    <button
                                        key={similarity}
                                        type="button"
                                        onClick={() => updateField('vectorSimilarity', similarity)}
                                        className={`
                                            relative p-4 rounded-xl border-2 text-left transition-all duration-200
                                            hover:shadow-md hover:-translate-y-0.5
                                            ${colors.bg} ${colors.border}
                                        `}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            {isSelected && (
                                                <CheckCircle2 className={`h-4 w-4 ${colors.text}`} />
                                            )}
                                            <span className={`font-semibold ${colors.text}`}>
                                                {info.label}
                                            </span>
                                            {info.recommended && (
                                                <Badge
                                                    variant="secondary"
                                                    className={`text-[10px] px-1.5 py-0 ${
                                                        isSelected
                                                            ? 'bg-teal-500/20 text-teal-600 dark:text-teal-400 border-teal-500/30'
                                                            : ''
                                                    }`}
                                                >
                                                    Recommended
                                                </Badge>
                                            )}
                                        </div>
                                        <p className={`text-xs leading-relaxed ${colors.desc}`}>
                                            {info.description}
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Note: RRF Settings are now configured at Search Experience level */}
                    {isHybrid && (
                        <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                            <p className="text-xs text-muted-foreground">
                                Hybrid search tuning (lexical/semantic weights, RRF parameters) will be configured
                                in your Search Experience settings after creating the index.
                            </p>
                        </div>
                    )}
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}