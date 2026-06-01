// app/search-indexes/_components/ImportWizard/ImportWizard.tsx

/**
 * Search Index Import Wizard
 *
 * A multi-step wizard for importing search indexes from JSON files.
 *
 * Steps:
 * 1. Upload - Select and validate JSON file
 * 2. Configure - Resolve name conflicts
 * 3. AI Config - Select AI provider/model (only for semantic/hybrid)
 * 4. Review - Final confirmation before import
 *
 * Features:
 * - Auto-populates AI config from system defaults
 * - Validates at each step before proceeding
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    ChevronLeft,
    ChevronRight,
    Check,
    Loader2,
    AlertCircle,
} from 'lucide-react';
import { StepProgress } from '@/components/ui/steps-progress';
import { StepUpload } from './StepUpload';
import { StepConfigure } from './StepConfigure';
import { StepAIConfig } from './StepAIConfig';
import { StepReview } from './StepReview';
import {
    usePreviewImport,
    useImportSearchIndex,
} from '../../_lib/hooks/useSearchIndexExport';
import { useAIProviders, useModelsForPurpose } from '@/app/ai-providers/_lib/hooks/useAIProviders';
import type { SearchIndexImportPreview, SearchIndexImportPayload } from '../../_lib/api-client';

// ============================================================================
// TYPES
// ============================================================================

interface ImportWizardProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface WizardState {
    currentStep: number;
    importData: unknown;
    preview: SearchIndexImportPreview | null;
    overrideName: string;
    selectedProviderId: string;
    selectedModelId: number | null;
    embeddingDimensions: number | null;
    stepErrors: Record<string, string>;
    fileError: string | null;
}

const INITIAL_STATE: WizardState = {
    currentStep: 1,
    importData: null,
    preview: null,
    overrideName: '',
    selectedProviderId: '',
    selectedModelId: null,
    embeddingDimensions: null,
    stepErrors: {},
    fileError: null,
};

// ============================================================================
// COMPONENT
// ============================================================================

export function ImportWizard({ open, onOpenChange }: ImportWizardProps) {
    const router = useRouter();
    const [state, setState] = useState<WizardState>(INITIAL_STATE);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const isRedirecting = useRef(false);

    // Mutations
    const previewImport = usePreviewImport();
    const importSearchIndex = useImportSearchIndex();

    // Data fetching
    const { providers } = useAIProviders({ enabled: true });
    const { data: embeddingModels } = useModelsForPurpose('embedding');

    // Derived
    const { currentStep, preview, selectedProviderId, selectedModelId } = state;
    const requiresAI = preview?.requiresAIConfig ?? false;
    const totalSteps = requiresAI ? 4 : 3;
    const isLastStep = currentStep === totalSteps;

    const stepLabels = requiresAI
        ? ['Upload', 'Configure', 'AI Config', 'Review']
        : ['Upload', 'Configure', 'Review'];

    // Get selected provider/model names for review
    const enabledProviders = providers?.filter(p => p.isEnabled) || [];
    const selectedProvider = enabledProviders.find(p => p.id === selectedProviderId);
    const selectedModel = embeddingModels?.find(m => m.id === selectedModelId);

    // Reset state when dialog closes
    useEffect(() => {
        if (!open) {
            setState(INITIAL_STATE);
            setSubmitError(null);
            isRedirecting.current = false;
        }
    }, [open]);

    // ========================================================================
    // STATE UPDATES
    // ========================================================================

    const setPreview = useCallback((preview: SearchIndexImportPreview | null, importData: unknown) => {
        setState(prev => ({
            ...prev,
            preview,
            importData,
            // Auto-set override name if conflict
            overrideName: preview?.searchIndex.nameConflict
                ? (preview?.searchIndex.suggestedName || '')
                : '',
            stepErrors: {},
            fileError: null,
        }));
    }, []);

    const setFileError = useCallback((error: string | null) => {
        setState(prev => ({ ...prev, fileError: error }));
    }, []);

    const setOverrideName = useCallback((name: string) => {
        setState(prev => ({
            ...prev,
            overrideName: name,
            stepErrors: { ...prev.stepErrors, overrideName: undefined } as Record<string, string>,
        }));
        setSubmitError(null);
    }, []);

    const setAIConfig = useCallback((
        providerId: string,
        modelId: number | null,
        dimensions: number | null
    ) => {
        setState(prev => ({
            ...prev,
            selectedProviderId: providerId,
            selectedModelId: modelId,
            embeddingDimensions: dimensions,
            stepErrors: {
                ...prev.stepErrors,
                aiProviderId: undefined,
                aiModelId: undefined,
            } as Record<string, string>,
        }));
        setSubmitError(null);
    }, []);

    // ========================================================================
    // VALIDATION
    // ========================================================================

    const validateStep = useCallback((step: number): boolean => {
        const errors: Record<string, string> = {};

        switch (step) {
            case 1:
                // Step 1: File must be loaded with valid preview
                if (!state.preview) {
                    errors.file = 'Please select a valid JSON file';
                }
                break;

            case 2:
                // Step 2: Name must be valid if conflict
                if (state.preview?.searchIndex.nameConflict && !state.overrideName.trim()) {
                    errors.overrideName = 'Please provide a unique name';
                }
                // Validate name format if provided
                if (state.overrideName.trim()) {
                    const nameRegex = /^[a-z][a-z0-9_-]*$/;
                    if (!nameRegex.test(state.overrideName.trim())) {
                        errors.overrideName = 'Name must start with a letter and contain only lowercase letters, numbers, hyphens, and underscores';
                    }
                }
                break;

            case 3:
                // Step 3: AI config (only if required)
                if (requiresAI) {
                    if (!state.selectedProviderId) {
                        errors.aiProviderId = 'Please select an AI provider';
                    }
                    if (!state.selectedModelId) {
                        errors.aiModelId = 'Please select an embedding model';
                    }
                }
                break;

            // Step 4 (Review) - no validation needed
        }

        setState(prev => ({ ...prev, stepErrors: errors }));
        return Object.keys(errors).length === 0;
    }, [state.preview, state.overrideName, state.selectedProviderId, state.selectedModelId, requiresAI]);

    // ========================================================================
    // NAVIGATION
    // ========================================================================

    const handleNext = useCallback(() => {
        const isValid = validateStep(currentStep);
        if (isValid && currentStep < totalSteps) {
            setState(prev => ({
                ...prev,
                currentStep: prev.currentStep + 1,
                stepErrors: {},
            }));
        }
    }, [currentStep, totalSteps, validateStep]);

    const handleBack = useCallback(() => {
        if (currentStep > 1) {
            setState(prev => ({
                ...prev,
                currentStep: prev.currentStep - 1,
                stepErrors: {},
            }));
            setSubmitError(null);
        }
    }, [currentStep]);

    // ========================================================================
    // IMPORT
    // ========================================================================

    const handleImport = useCallback(async () => {
        if (!state.importData || !state.preview) return;

        const payload: SearchIndexImportPayload = {
            importData: state.importData,
            overrideName: state.overrideName.trim() || undefined,
        };

        // Add AI config if required
        if (requiresAI && state.selectedProviderId && state.selectedModelId && state.embeddingDimensions) {
            payload.aiConfig = {
                aiProviderId: state.selectedProviderId,
                aiModelId: state.selectedModelId,
                embeddingDimensions: state.embeddingDimensions,
            };
        }

        try {
            const result = await importSearchIndex.mutateAsync(payload);
            isRedirecting.current = true;
            onOpenChange(false);

            // Navigate to the new search index
            if (result.searchIndexId) {
                router.push(`/search-indexes/${result.searchIndexId}`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to import search index';
            setSubmitError(message);
        }
    }, [state, requiresAI, importSearchIndex, onOpenChange, router]);

    // ========================================================================
    // FILE HANDLING
    // ========================================================================

    const handleFileLoaded = useCallback(async (data: unknown) => {
        try {
            const previewResult = await previewImport.mutateAsync(data);
            setPreview(previewResult, data);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to preview import';
            setFileError(message);
        }
    }, [previewImport, setPreview, setFileError]);

    // ========================================================================
    // RENDER
    // ========================================================================

    const isLoading = previewImport.isPending || importSearchIndex.isPending || isRedirecting.current;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="!max-w-5xl !w-[900px] min-h-[650px] max-h-[90vh] flex flex-col p-0">
                <DialogHeader className="border-b border-border/50 px-8 pt-6 pb-5">
                    <div className="flex items-center justify-between mb-5">
                        <DialogTitle className="text-2xl font-semibold">
                            Import Search Index
                        </DialogTitle>
                    </div>
                    <StepProgress currentStep={currentStep} steps={stepLabels} />
                </DialogHeader>

                <div className="flex-1 overflow-y-auto py-8 px-8">
                    {/* Submission Error Alert */}
                    {submitError && (
                        <Alert variant="destructive" className="mb-6 rounded-xl">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{submitError}</AlertDescription>
                        </Alert>
                    )}

                    {/* Step Content */}
                    {currentStep === 1 && (
                        <StepUpload
                            onFileLoaded={handleFileLoaded}
                            isLoading={previewImport.isPending}
                            error={state.fileError}
                            preview={state.preview}
                        />
                    )}

                    {currentStep === 2 && state.preview && (
                        <StepConfigure
                            preview={state.preview}
                            overrideName={state.overrideName}
                            setOverrideName={setOverrideName}
                            errors={state.stepErrors}
                        />
                    )}

                    {currentStep === 3 && requiresAI && (
                        <StepAIConfig
                            selectedProviderId={state.selectedProviderId}
                            selectedModelId={state.selectedModelId}
                            embeddingDimensions={state.embeddingDimensions}
                            setAIConfig={setAIConfig}
                            errors={state.stepErrors}
                        />
                    )}

                    {currentStep === totalSteps && state.preview && (
                        <StepReview
                            preview={state.preview}
                            overrideName={state.overrideName}
                            providerName={selectedProvider?.displayName}
                            modelName={selectedModel?.displayName}
                        />
                    )}
                </div>

                <DialogFooter className="border-t border-border/50 px-8 py-5 flex items-center justify-between">
                    {/* Back Button */}
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleBack}
                        disabled={currentStep === 1 || isLoading}
                        className="rounded-xl h-10 px-5"
                    >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Back
                    </Button>

                    {/* Step Indicator */}
                    <span className="text-sm text-muted-foreground">
                        Step {currentStep} of {totalSteps}
                    </span>

                    {/* Next/Import Button */}
                    {isLastStep ? (
                        <Button
                            type="button"
                            onClick={handleImport}
                            disabled={isLoading}
                            className="rounded-xl h-10 min-w-[160px]"
                        >
                            {importSearchIndex.isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Importing...
                                </>
                            ) : (
                                <>
                                    <Check className="h-4 w-4 mr-2" />
                                    Import
                                </>
                            )}
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            onClick={handleNext}
                            disabled={isLoading || (currentStep === 1 && !state.preview)}
                            className="rounded-xl h-10 px-6"
                        >
                            Next
                            <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
