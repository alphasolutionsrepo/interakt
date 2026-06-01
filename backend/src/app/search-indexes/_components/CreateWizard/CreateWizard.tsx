// app/search-indexes/_components/CreateWizard/CreateWizard.tsx

/**
 * Search Index Creation Wizard
 * 
 * A multi-step form for creating search indexes.
 * 
 * Design decisions:
 * - NO <form> tag - prevents accidental submissions in multi-step flow
 * - Step-specific validation schemas - each step validates independently
 * - Manual validation on "Next" and "Create" - no automatic/premature validation
 * - Pre-selection of AI defaults - uses system defaults when available
 * - Inline error display - errors shown under each field
 * - Single toast - API called directly to avoid duplicate toasts from hooks
 * - Smooth loading transition - loading state maintained during redirect
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    ChevronLeft,
    ChevronRight,
    Check,
    Loader2,
    AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { StepProgress } from '@/components/ui/steps-progress';
import { StepBasicInfo } from './StepBasicInfo';
import { StepSearchSettings } from './StepSearchSettings';
import { StepAIConfig } from './StepAIConfig';
import { searchIndexesApi } from '../../_lib/api-client';
import { searchIndexKeys } from '../../_lib/hooks/useSearchIndexes';
import { requiresAIConfiguration } from '@/features/search-index';
import {
    wizardStep1Schema,
    wizardStep2Schema,
    wizardStep3Schema,
    WIZARD_DEFAULT_VALUES,
    type WizardFormData,
} from '@/features/search-index/search-index.wizard-schemas';
import type { CreateSearchIndexDTO } from '@/features/search-index';

// ============================================================================
// TYPES
// ============================================================================

type StepErrors = Record<string, string>;

interface WizardState {
    currentStep: number;
    formData: WizardFormData;
    stepErrors: StepErrors;
    stepValidated: Record<number, boolean>; // Track which steps have been validated
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CreateWizard() {
    const router = useRouter();
    const queryClient = useQueryClient();

    // ========================================================================
    // STATE
    // ========================================================================

    const [state, setState] = useState<WizardState>({
        currentStep: 1,
        formData: { ...WIZARD_DEFAULT_VALUES },
        stepErrors: {},
        stepValidated: {},
    });

    // External errors (e.g., from async validation like name availability)
    const [externalErrors, setExternalErrors] = useState<Record<string, string | undefined>>({});

    // Separate loading states for better control
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    // Track if we're redirecting to keep loading state
    const isRedirecting = useRef(false);

    const { currentStep, formData, stepErrors } = state;
    const needsAI = requiresAIConfiguration(formData.searchType);
    const totalSteps = needsAI ? 3 : 2;
    const isLastStep = currentStep === totalSteps;

    const stepLabels = needsAI
        ? ['Basic Info', 'Search Settings', 'AI Configuration']
        : ['Basic Info', 'Search Settings'];

    // Combine step errors with external errors for display
    // Filter out undefined values and properly type the result
    const allErrors: Record<string, string> = {
        ...stepErrors,
        ...Object.fromEntries(
            Object.entries(externalErrors)
                .filter((entry): entry is [string, string] => entry[1] !== undefined)
        ),
    };

    // ========================================================================
    // FORM DATA UPDATES
    // ========================================================================

    /**
     * Update form data for any field
     * Clears the error for that field when updated
     */
    const updateFormData = useCallback(<K extends keyof WizardFormData>(
        field: K,
        value: WizardFormData[K]
    ) => {
        setState(prev => ({
            ...prev,
            formData: { ...prev.formData, [field]: value },
            // Clear error for this field when user updates it
            stepErrors: { ...prev.stepErrors, [field]: undefined },
        }));
        // Clear submit error when user makes changes
        setSubmitError(null);
    }, []);

    /**
     * Bulk update form data (for setting multiple fields at once)
     */
    const updateFormDataBulk = useCallback((updates: Partial<WizardFormData>) => {
        setState(prev => {
            const newErrors = { ...prev.stepErrors };
            // Clear errors for all updated fields
            Object.keys(updates).forEach(key => {
                delete newErrors[key];
            });
            return {
                ...prev,
                formData: { ...prev.formData, ...updates },
                stepErrors: newErrors,
            };
        });
        setSubmitError(null);
    }, []);

    // ========================================================================
    // VALIDATION
    // ========================================================================

    /**
     * Set an external error for a field (e.g., from async validation)
     */
    const setExternalError = useCallback((field: string, error: string | undefined) => {
        setExternalErrors(prev => ({ ...prev, [field]: error }));
    }, []);

    /**
     * Validate a specific step
     * Returns true if valid, false otherwise
     * Sets stepErrors state with any validation errors
     */
    const validateStep = useCallback((step: number): boolean => {
        let schema;
        let dataToValidate;

        switch (step) {
            case 1:
                schema = wizardStep1Schema;
                dataToValidate = {
                    displayName: formData.displayName,
                    name: formData.name,
                    description: formData.description,
                    searchType: formData.searchType,
                    searchProvider: formData.searchProvider,
                };
                break;
            case 2:
                schema = wizardStep2Schema;
                dataToValidate = {
                    indexingStrategy: formData.indexingStrategy,
                    language: formData.language,
                    synonyms: formData.synonyms,
                    stopWords: formData.stopWords,
                    providerSettings: formData.providerSettings,
                };
                break;
            case 3:
                // Only validate AI fields if search type requires AI
                if (!needsAI) return true;
                schema = wizardStep3Schema;
                dataToValidate = {
                    aiProviderId: formData.aiProviderId,
                    aiModelId: formData.aiModelId,
                    embeddingDimensions: formData.embeddingDimensions,
                    vectorSimilarity: formData.vectorSimilarity,
                    rrfRankConstant: formData.rrfRankConstant,
                    rrfWindowSize: formData.rrfWindowSize,
                };
                break;
            default:
                return true;
        }

        const result = schema.safeParse(dataToValidate);

        // Check for external errors on this step (like name availability)
        const hasExternalErrors = step === 1 && externalErrors.name;

        if (result.success && !hasExternalErrors) {
            // Clear errors for this step
            setState(prev => ({
                ...prev,
                stepErrors: {},
                stepValidated: { ...prev.stepValidated, [step]: true },
            }));
            return true;
        }

        // Convert Zod errors to simple field -> message map
        const errors: StepErrors = {};
        if (!result.success) {
            result.error.errors.forEach(err => {
                const field = err.path[0] as string;
                if (!errors[field]) {
                    errors[field] = err.message;
                }
            });
        }

        // Add external errors
        if (hasExternalErrors && externalErrors.name) {
            errors.name = externalErrors.name;
        }

        setState(prev => ({
            ...prev,
            stepErrors: errors,
            stepValidated: { ...prev.stepValidated, [step]: true },
        }));

        return false;
    }, [formData, needsAI, externalErrors]);

    // ========================================================================
    // NAVIGATION
    // ========================================================================

    const handleNext = useCallback(() => {
        const isValid = validateStep(currentStep);
        if (isValid && currentStep < totalSteps) {
            setState(prev => ({
                ...prev,
                currentStep: prev.currentStep + 1,
                stepErrors: {}, // Clear errors when moving forward
            }));
        }
    }, [currentStep, totalSteps, validateStep]);

    const handleBack = useCallback(() => {
        if (currentStep > 1) {
            setState(prev => ({
                ...prev,
                currentStep: prev.currentStep - 1,
                stepErrors: {}, // Clear errors when going back
            }));
        }
    }, [currentStep]);

    // ========================================================================
    // SUBMISSION
    // ========================================================================

    const handleCreate = useCallback(async () => {
        // Validate current step first
        const isValid = validateStep(currentStep);
        if (!isValid) return;

        // Build the DTO for API submission
        const dto: CreateSearchIndexDTO = {
            // Step 1
            displayName: formData.displayName,
            name: formData.name,
            description: formData.description || undefined,
            searchType: formData.searchType,
            searchProvider: (formData.searchProvider || 'elasticsearch') as CreateSearchIndexDTO['searchProvider'],

            // Step 2
            indexingStrategy: formData.indexingStrategy,
            language: formData.language,
            synonyms: formData.synonyms,
            stopWords: formData.stopWords,
            providerSettings: formData.providerSettings ?? {},

            // Step 3 (only if AI is needed)
            ...(needsAI && {
                aiProviderId: formData.aiProviderId,
                aiModelId: formData.aiModelId,
                embeddingDimensions: formData.embeddingDimensions,
                vectorSimilarity: formData.vectorSimilarity,
                rrfRankConstant: formData.rrfRankConstant,
                rrfWindowSize: formData.rrfWindowSize,
            })
        };

        setIsSubmitting(true);
        setSubmitError(null);

        try {
            // Call API directly (not through mutation hook to avoid duplicate toasts)
            const newIndex = await searchIndexesApi.create(dto);

            // Invalidate queries manually
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.lists() });
            queryClient.invalidateQueries({ queryKey: searchIndexKeys.allActive() });

            // Show single success toast
            toast.success(`Search index "${newIndex.displayName}" created successfully`);

            // Mark as redirecting to keep loading state
            isRedirecting.current = true;

            // Navigate without the ?created=true param (we already showed the toast)
            router.push(`/search-indexes/${newIndex.id}`);

            // Note: We don't setIsSubmitting(false) here because we want to keep
            // the loading state until the page transitions
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create search index';
            setSubmitError(message);
            toast.error(message);
            setIsSubmitting(false);
        }
    }, [currentStep, formData, needsAI, validateStep, queryClient, router]);

    // ========================================================================
    // RENDER
    // ========================================================================

    // Show loading if submitting OR redirecting
    const showLoading = isSubmitting || isRedirecting.current;

    return (
        <Card className="border-border/60 shadow-sm rounded-2xl w-full max-w-4xl">
            <CardHeader className="border-b border-border/50 pb-4">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <CardTitle className="text-xl font-semibold">
                            {currentStep === 1 && 'Basic Information'}
                            {currentStep === 2 && 'Search Settings'}
                            {currentStep === 3 && 'AI Configuration'}
                        </CardTitle>
                        <CardDescription className="mt-1.5">
                            {currentStep === 1 && 'Configure the basic information for your search index'}
                            {currentStep === 2 && 'Set up search behavior and text analysis options'}
                            {currentStep === 3 && 'Configure AI provider and embedding model for semantic search'}
                        </CardDescription>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push('/search-indexes')}
                        className="rounded-xl text-muted-foreground hover:text-foreground"
                        disabled={showLoading}
                    >
                        Cancel
                    </Button>
                </div>

                <StepProgress currentStep={currentStep} steps={stepLabels} />
            </CardHeader>

            <CardContent className="pt-6 pb-6">
                {/* Submission Error Alert */}
                {submitError && (
                    <Alert variant="destructive" className="mb-6 rounded-xl">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{submitError}</AlertDescription>
                    </Alert>
                )}

                {/* Step Content */}
                {currentStep === 1 && (
                    <StepBasicInfo
                        formData={formData}
                        errors={allErrors}
                        updateField={updateFormData}
                        setExternalError={setExternalError}
                    />
                )}
                {currentStep === 2 && (
                    <StepSearchSettings
                        formData={formData}
                        errors={allErrors}
                        updateField={updateFormData}
                    />
                )}
                {currentStep === 3 && needsAI && (
                    <StepAIConfig
                        formData={formData}
                        errors={allErrors}
                        updateField={updateFormData}
                        updateFieldBulk={updateFormDataBulk}
                    />
                )}
            </CardContent>

            <CardFooter className="border-t border-border/50 pt-4 flex items-center justify-between">
                {/* Back Button */}
                <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    disabled={currentStep === 1 || showLoading}
                    className="rounded-xl"
                >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Back
                </Button>

                {/* Step Indicator */}
                <span className="text-sm text-muted-foreground">
                    Step {currentStep} of {totalSteps}
                </span>

                {/* Next/Submit Button */}
                {isLastStep ? (
                    <Button
                        type="button"
                        onClick={handleCreate}
                        disabled={showLoading}
                        className="rounded-xl min-w-[140px]"
                    >
                        {showLoading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            <>
                                <Check className="h-4 w-4 mr-2" />
                                Create Index
                            </>
                        )}
                    </Button>
                ) : (
                    <Button
                        type="button"
                        onClick={handleNext}
                        disabled={showLoading}
                        className="rounded-xl"
                    >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}