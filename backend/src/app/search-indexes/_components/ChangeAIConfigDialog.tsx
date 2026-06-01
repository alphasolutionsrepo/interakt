// app/search-indexes/_components/ChangeAIConfigDialog.tsx

/**
 * Change AI Configuration Dialog
 *
 * A multi-step dialog for changing the AI provider and embedding model
 * for a semantic/hybrid search index.
 *
 * WARNING: This is a destructive operation that deletes all indexed documents.
 */

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Brain,
    Loader2,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    ArrowRight,
    ArrowLeft,
    Server,
    Sparkles,
    Trash2,
    RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIProviders, useModelsForPurpose } from '@/app/ai-providers/_lib/hooks/useAIProviders';
import { VECTOR_SIMILARITY_INFO } from '@/features/search-index';

// ============================================================================
// TYPES
// ============================================================================

type DialogStep = 'select' | 'confirm' | 'processing' | 'success' | 'error';

interface ChangeAIConfigDialogProps {
    /** Whether the dialog is open */
    open: boolean;
    /** Callback when dialog should close */
    onOpenChange: (open: boolean) => void;
    /** Search index ID */
    searchIndexId: string;
    /** Current index display name */
    indexDisplayName: string;
    /** Current document count */
    currentDocumentCount: number;
    /** Current AI provider ID */
    currentProviderId?: string | null;
    /** Current AI model ID */
    currentModelId?: number | null;
    /** Current embedding dimensions */
    currentDimensions?: number | null;
    /** Current vector similarity */
    currentVectorSimilarity?: 'cosine' | 'euclidean' | 'dot_product';
    /** Function to execute the change */
    onChangeConfig: (config: {
        aiProviderId: string;
        aiModelId: number;
        embeddingDimensions: number;
        vectorSimilarity?: 'cosine' | 'euclidean' | 'dot_product';
        confirmText: 'CONFIRM';
    }) => Promise<{ documentsDeleted: number }>;
    /** Callback when change completes successfully */
    onSuccess?: () => void;
}

interface ChangeResult {
    documentsDeleted: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ChangeAIConfigDialog({
    open,
    onOpenChange,
    // searchIndexId is passed but not used directly - the parent handles the API call
    searchIndexId: _searchIndexId,
    indexDisplayName,
    currentDocumentCount,
    currentProviderId,
    currentModelId,
    currentDimensions,
    currentVectorSimilarity = 'cosine',
    onChangeConfig,
    onSuccess,
}: ChangeAIConfigDialogProps) {
    // State
    const [step, setStep] = useState<DialogStep>('select');
    const [selectedProviderId, setSelectedProviderId] = useState<string>('');
    const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
    const [selectedDimensions, setSelectedDimensions] = useState<number | null>(null);
    const [selectedVectorSimilarity, setSelectedVectorSimilarity] = useState<'cosine' | 'euclidean' | 'dot_product'>(currentVectorSimilarity);
    const [confirmText, setConfirmText] = useState('');
    const [result, setResult] = useState<ChangeResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Data fetching
    const { providers, isLoading: isLoadingProviders } = useAIProviders({ enabled: open });
    const { data: embeddingModels, isLoading: isLoadingModels } = useModelsForPurpose('embedding');

    // Derived data
    const enabledProviders = useMemo(() =>
        providers?.filter(p => p.isEnabled) || [],
        [providers]
    );

    const availableModels = useMemo(() =>
        embeddingModels?.filter(m => m.provider.id === selectedProviderId) || [],
        [embeddingModels, selectedProviderId]
    );

    const selectedModel = useMemo(() =>
        embeddingModels?.find(m => m.id === selectedModelId),
        [embeddingModels, selectedModelId]
    );

    const currentProvider = useMemo(() =>
        providers?.find(p => p.id === currentProviderId),
        [providers, currentProviderId]
    );

    const currentModel = useMemo(() =>
        embeddingModels?.find(m => m.id === currentModelId),
        [embeddingModels, currentModelId]
    );

    const isLoading = isLoadingProviders || isLoadingModels;

    // Check if configuration actually changed
    const hasConfigChanged = useMemo(() => {
        if (!selectedProviderId || !selectedModelId) return false;
        return (
            selectedProviderId !== currentProviderId ||
            selectedModelId !== currentModelId ||
            selectedVectorSimilarity !== currentVectorSimilarity
        );
    }, [selectedProviderId, selectedModelId, selectedVectorSimilarity, currentProviderId, currentModelId, currentVectorSimilarity]);

    // Validation
    const isConfirmValid = confirmText === 'CONFIRM';
    const canProceed = selectedProviderId && selectedModelId && selectedDimensions && hasConfigChanged;

    // Reset state when dialog opens
    useEffect(() => {
        if (open) {
            setStep('select');
            setSelectedProviderId(currentProviderId || '');
            setSelectedModelId(currentModelId || null);
            setSelectedDimensions(currentDimensions || null);
            setSelectedVectorSimilarity(currentVectorSimilarity);
            setConfirmText('');
            setResult(null);
            setError(null);
        }
    }, [open, currentProviderId, currentModelId, currentDimensions, currentVectorSimilarity]);

    // Count embedding models per provider
    const getEmbeddingModelCount = useCallback((providerId: string) => {
        return embeddingModels?.filter(m => m.provider.id === providerId).length || 0;
    }, [embeddingModels]);

    // Handlers
    const handleProviderChange = useCallback((value: string) => {
        setSelectedProviderId(value);
        // Auto-select first model for the provider
        if (value && embeddingModels) {
            const firstModel = embeddingModels.find(m => m.provider.id === value);
            if (firstModel) {
                setSelectedModelId(firstModel.id);
                setSelectedDimensions(firstModel.dimensions ?? null);
            } else {
                setSelectedModelId(null);
                setSelectedDimensions(null);
            }
        }
    }, [embeddingModels]);

    const handleModelChange = useCallback((value: string) => {
        const modelId = parseInt(value);
        setSelectedModelId(modelId);
        const model = embeddingModels?.find(m => m.id === modelId);
        setSelectedDimensions(model?.dimensions ?? null);
    }, [embeddingModels]);

    const handleNext = useCallback(() => {
        if (step === 'select' && canProceed) {
            setStep('confirm');
        }
    }, [step, canProceed]);

    const handleBack = useCallback(() => {
        if (step === 'confirm') {
            setStep('select');
            setConfirmText('');
        }
    }, [step]);

    const handleConfirm = useCallback(async () => {
        if (!isConfirmValid || !selectedProviderId || !selectedModelId || !selectedDimensions) return;

        setStep('processing');
        setError(null);

        try {
            const changeResult = await onChangeConfig({
                aiProviderId: selectedProviderId,
                aiModelId: selectedModelId,
                embeddingDimensions: selectedDimensions,
                vectorSimilarity: selectedVectorSimilarity,
                confirmText: 'CONFIRM',
            });
            setResult(changeResult);
            // Close dialog and call success callback immediately
            onSuccess?.();
            onOpenChange(false);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to change AI configuration';
            setError(errorMessage);
            setStep('error');
        }
    }, [isConfirmValid, selectedProviderId, selectedModelId, selectedDimensions, selectedVectorSimilarity, onChangeConfig, onSuccess, onOpenChange]);

    const handleClose = useCallback(() => {
        onOpenChange(false);
    }, [onOpenChange]);

    // ========================================================================
    // RENDER
    // ========================================================================

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Brain className={cn(
                            "h-5 w-5",
                            step === 'select' && "text-violet-500",
                            step === 'confirm' && "text-amber-500",
                            step === 'processing' && "animate-pulse text-blue-500",
                            step === 'success' && "text-emerald-500",
                            step === 'error' && "text-red-500"
                        )} />
                        {step === 'select' && 'Change AI Configuration'}
                        {step === 'confirm' && 'Confirm Changes'}
                        {step === 'processing' && 'Applying Changes...'}
                        {step === 'success' && 'Configuration Updated'}
                        {step === 'error' && 'Update Failed'}
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'select' && (
                            <>Select a new AI provider and embedding model for <strong>{indexDisplayName}</strong>.</>
                        )}
                        {step === 'confirm' && (
                            <>Review and confirm the changes to your search index.</>
                        )}
                        {step === 'processing' && (
                            <>Please wait while the configuration is being updated.</>
                        )}
                        {step === 'success' && (
                            <>The AI configuration has been successfully updated.</>
                        )}
                        {step === 'error' && (
                            <>An error occurred while updating the configuration.</>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {/* Step 1: Selection */}
                    {step === 'select' && (
                        <div className="space-y-5">
                            {/* Current Configuration */}
                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 space-y-2">
                                <Label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Current Configuration</Label>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-600 dark:text-slate-400">Provider</span>
                                    <Badge variant="outline" className="font-medium">
                                        {currentProvider?.displayName || 'Unknown'}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-600 dark:text-slate-400">Model</span>
                                    <Badge variant="outline" className="font-medium">
                                        {currentModel?.displayName || 'Unknown'}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-600 dark:text-slate-400">Dimensions</span>
                                    <span className="text-sm font-medium">{currentDimensions || 'N/A'}</span>
                                </div>
                            </div>

                            {/* New Configuration */}
                            <div className="space-y-4">
                                <Label className="text-xs font-medium text-slate-500 uppercase tracking-wide">New Configuration</Label>

                                {/* Provider Selection */}
                                <div className="space-y-2">
                                    <Label htmlFor="provider" className="text-sm font-medium">
                                        AI Provider <span className="text-destructive">*</span>
                                    </Label>
                                    <Select
                                        value={selectedProviderId}
                                        onValueChange={handleProviderChange}
                                        disabled={isLoading}
                                    >
                                        <SelectTrigger className="h-11 rounded-xl">
                                            <SelectValue placeholder={isLoading ? 'Loading...' : 'Select provider'} />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-xl">
                                            {enabledProviders.map((provider) => {
                                                const embeddingCount = getEmbeddingModelCount(provider.id);
                                                return (
                                                    <SelectItem key={provider.id} value={provider.id} className="rounded-lg">
                                                        <div className="flex items-center gap-2">
                                                            {provider.providerType === 'local' ? (
                                                                <Server className="h-4 w-4 text-slate-500" />
                                                            ) : (
                                                                <Sparkles className="h-4 w-4 text-violet-500" />
                                                            )}
                                                            <span className="font-medium">{provider.displayName}</span>
                                                            <Badge variant="outline" className="text-xs ml-1">
                                                                {embeddingCount} models
                                                            </Badge>
                                                        </div>
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Model Selection */}
                                <div className="space-y-2">
                                    <Label htmlFor="model" className="text-sm font-medium">
                                        Embedding Model <span className="text-destructive">*</span>
                                    </Label>
                                    <Select
                                        value={selectedModelId?.toString() || ''}
                                        onValueChange={handleModelChange}
                                        disabled={!selectedProviderId || isLoading}
                                    >
                                        <SelectTrigger className="h-11 rounded-xl">
                                            <SelectValue placeholder={
                                                !selectedProviderId
                                                    ? 'Select provider first'
                                                    : isLoading
                                                        ? 'Loading...'
                                                        : 'Select model'
                                            } />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-xl">
                                            {availableModels.map((model) => (
                                                <SelectItem key={model.id} value={model.id.toString()} className="rounded-lg">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium">{model.displayName}</span>
                                                        {model.dimensions && (
                                                            <Badge variant="outline" className="text-xs">
                                                                {model.dimensions}d
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Vector Similarity */}
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">Vector Similarity</Label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['cosine', 'euclidean', 'dot_product'] as const).map((similarity) => {
                                            const info = VECTOR_SIMILARITY_INFO[similarity];
                                            const isSelected = selectedVectorSimilarity === similarity;
                                            return (
                                                <button
                                                    key={similarity}
                                                    type="button"
                                                    onClick={() => setSelectedVectorSimilarity(similarity)}
                                                    className={cn(
                                                        "p-3 rounded-xl border-2 text-left transition-all",
                                                        isSelected
                                                            ? "border-violet-500 bg-violet-50 dark:bg-violet-500/10"
                                                            : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                                                    )}
                                                >
                                                    <span className={cn(
                                                        "text-sm font-medium",
                                                        isSelected ? "text-violet-700 dark:text-violet-400" : "text-slate-700 dark:text-slate-300"
                                                    )}>
                                                        {info.label}
                                                    </span>
                                                    {info.recommended && (
                                                        <Badge variant="secondary" className="text-[10px] ml-1 px-1">
                                                            Default
                                                        </Badge>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Dimensions Preview */}
                                {selectedDimensions && (
                                    <div className="flex items-center justify-between p-3 bg-violet-50 dark:bg-violet-500/10 rounded-xl">
                                        <span className="text-sm text-violet-700 dark:text-violet-400">New Embedding Dimensions</span>
                                        <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400 border-0">
                                            {selectedDimensions}
                                        </Badge>
                                    </div>
                                )}
                            </div>

                            {/* No change warning */}
                            {selectedProviderId && selectedModelId && !hasConfigChanged && (
                                <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-3 text-center">
                                    <p className="text-sm text-slate-600 dark:text-slate-400">
                                        The selected configuration is the same as the current one.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 2: Confirmation */}
                    {step === 'confirm' && (
                        <div className="space-y-5">
                            {/* Warning Banner - Different message based on document count */}
                            {currentDocumentCount > 0 ? (
                                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4">
                                    <div className="flex gap-3">
                                        <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                                        <div className="space-y-2">
                                            <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                                                Destructive Operation Warning
                                            </p>
                                            <p className="text-sm text-red-700 dark:text-red-400">
                                                Changing the AI configuration will:
                                            </p>
                                            <ul className="text-sm text-red-600 dark:text-red-400 space-y-1 list-disc list-inside">
                                                <li>Delete the Elasticsearch index</li>
                                                <li>
                                                    Remove all <strong>{currentDocumentCount.toLocaleString()}</strong> indexed documents
                                                </li>
                                                <li>Require you to re-upload and re-index all documents</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-4">
                                    <div className="flex gap-3">
                                        <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                                        <div className="space-y-2">
                                            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                                                Configuration Change
                                            </p>
                                            <p className="text-sm text-blue-700 dark:text-blue-400">
                                                No documents are currently indexed. You can safely change the AI configuration
                                                without losing any data.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Configuration Summary */}
                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 text-center">
                                        <p className="text-xs text-slate-500 mb-1">Current</p>
                                        <p className="text-sm font-medium">{currentProvider?.displayName}</p>
                                        <p className="text-xs text-slate-500">{currentModel?.displayName}</p>
                                        <Badge variant="outline" className="mt-1">{currentDimensions}d</Badge>
                                    </div>
                                    <ArrowRight className="h-5 w-5 text-slate-400 flex-shrink-0" />
                                    <div className="flex-1 text-center">
                                        <p className="text-xs text-violet-600 dark:text-violet-400 mb-1">New</p>
                                        <p className="text-sm font-medium text-violet-700 dark:text-violet-300">
                                            {enabledProviders.find(p => p.id === selectedProviderId)?.displayName}
                                        </p>
                                        <p className="text-xs text-violet-600 dark:text-violet-400">
                                            {selectedModel?.displayName}
                                        </p>
                                        <Badge className="mt-1 bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400 border-0">
                                            {selectedDimensions}d
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            {/* Confirmation Input */}
                            <div className="space-y-2">
                                <Label htmlFor="confirm-text" className="text-sm font-medium">
                                    Type <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-red-600 dark:text-red-400 font-mono">CONFIRM</code> to proceed
                                </Label>
                                <Input
                                    id="confirm-text"
                                    value={confirmText}
                                    onChange={(e) => setConfirmText(e.target.value)}
                                    placeholder="Type CONFIRM"
                                    className={cn(
                                        "h-11 rounded-xl font-mono text-center text-lg tracking-widest",
                                        confirmText === 'CONFIRM' && "border-emerald-500 ring-2 ring-emerald-500/20"
                                    )}
                                    autoComplete="off"
                                />
                            </div>
                        </div>
                    )}

                    {/* Processing State */}
                    {step === 'processing' && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="relative">
                                <Loader2 className="h-16 w-16 text-violet-500 animate-spin" />
                                <Brain className="h-8 w-8 text-violet-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-6">
                                Updating AI configuration...
                            </p>
                            <p className="text-xs text-slate-400 mt-2">
                                This may take a moment
                            </p>
                        </div>
                    )}

                    {/* Success State */}
                    {step === 'success' && result && (
                        <div className="space-y-5">
                            <div className="flex flex-col items-center justify-center py-6">
                                <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mb-4">
                                    <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                                    Configuration Updated
                                </p>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-600 dark:text-slate-400">New Provider</span>
                                    <Badge variant="outline">
                                        {enabledProviders.find(p => p.id === selectedProviderId)?.displayName}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-600 dark:text-slate-400">New Model</span>
                                    <Badge variant="outline">{selectedModel?.displayName}</Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-600 dark:text-slate-400">Dimensions</span>
                                    <span className="text-sm font-medium">{selectedDimensions}</span>
                                </div>
                                {result.documentsDeleted > 0 && (
                                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                                            <Trash2 className="h-4 w-4" />
                                            <span className="text-sm">Documents Removed</span>
                                        </div>
                                        <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                                            {result.documentsDeleted.toLocaleString()}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-3">
                                <div className="flex gap-2">
                                    <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                                    <p className="text-sm text-blue-700 dark:text-blue-400">
                                        You can now re-upload your documents to generate new embeddings with the updated model.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Error State */}
                    {step === 'error' && (
                        <div className="space-y-5">
                            <div className="flex flex-col items-center justify-center py-6">
                                <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center mb-4">
                                    <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                                </div>
                            </div>

                            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4">
                                <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">
                                    Error Details
                                </p>
                                <p className="text-sm text-red-600 dark:text-red-400">
                                    {error || 'An unknown error occurred'}
                                </p>
                            </div>

                            <p className="text-sm text-slate-500 text-center">
                                You can try again or check the server logs for more details.
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {step === 'select' && (
                        <>
                            <Button variant="outline" onClick={handleClose}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleNext}
                                disabled={!canProceed}
                                className="bg-violet-600 hover:bg-violet-700"
                            >
                                Continue
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </Button>
                        </>
                    )}

                    {step === 'confirm' && (
                        <>
                            <Button variant="outline" onClick={handleBack}>
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back
                            </Button>
                            <Button
                                onClick={handleConfirm}
                                disabled={!isConfirmValid}
                                className={currentDocumentCount > 0
                                    ? "bg-red-600 hover:bg-red-700"
                                    : "bg-violet-600 hover:bg-violet-700"
                                }
                            >
                                {currentDocumentCount > 0 ? (
                                    <AlertTriangle className="h-4 w-4 mr-2" />
                                ) : (
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                )}
                                Change Configuration
                            </Button>
                        </>
                    )}

                    {step === 'processing' && (
                        <Button variant="outline" disabled>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Processing...
                        </Button>
                    )}

                    {step === 'success' && (
                        <Button onClick={() => {
                            onSuccess?.();
                            handleClose();
                        }}>
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Done
                        </Button>
                    )}

                    {step === 'error' && (
                        <>
                            <Button variant="outline" onClick={handleClose}>
                                Close
                            </Button>
                            <Button
                                onClick={() => {
                                    setStep('confirm');
                                    setConfirmText('');
                                }}
                                variant="destructive"
                            >
                                Try Again
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default ChangeAIConfigDialog;
