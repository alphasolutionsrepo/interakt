// app/search-experiences/_components/CreateWizard/CreateWizard.tsx

/**
 * Search Experience Creation Wizard
 *
 * A multi-step form for creating search experiences.
 *
 * Design decisions:
 * - NO <form> tag - prevents accidental submissions in multi-step flow
 * - Step-specific validation schemas - each step validates independently
 * - Manual validation on "Next" and "Create" - no automatic/premature validation
 * - Inline error display - errors shown under each field
 * - Single toast - API called directly to avoid duplicate toasts from hooks
 * - Smooth loading transition - loading state maintained during redirect
 *
 * Steps:
 * 1. Basic Info - Name, slug, description, select indexes
 * 2. Search Settings - Pagination, highlighting, merge strategy
 * 3. AI Configuration - Summary and chat settings
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
  Info,
  Settings,
  Brain,
  Layout,
} from 'lucide-react';
import { toast } from 'sonner';
import { StepProgress } from '@/components/ui/steps-progress';
import { StepBasicInfo } from './StepBasicInfo';
import { StepSearchSettings } from './StepSearchSettings';
import { StepAIConfig } from './StepAIConfig';
import { StepDisplayConfig } from './StepDisplayConfig';
import { searchExperiencesApi } from '../../_lib/api-client';
import { searchExperienceKeys } from '../../_lib/hooks';
import {
  wizardStep1Schema,
  wizardStep2Schema,
  wizardStep3Schema,
  wizardStep4Schema,
  WIZARD_DEFAULT_VALUES,
  type WizardFormData,
  type CreateSearchExperienceDTO,
} from '@/features/search-experience/search-experience.client';

// ============================================================================
// TYPES
// ============================================================================

type StepErrors = Record<string, string>;

interface WizardState {
  currentStep: number;
  formData: WizardFormData;
  stepErrors: StepErrors;
  stepValidated: Record<number, boolean>;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CreateWizard({ basePath = '/search-experiences', listPath }: { basePath?: string; listPath?: string } = {}) {
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

  // External errors (e.g., from async validation like slug availability)
  const [externalErrors, setExternalErrors] = useState<Record<string, string | undefined>>({});

  // Separate loading states for better control
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Track if we're redirecting to keep loading state
  const isRedirecting = useRef(false);

  const { currentStep, formData, stepErrors } = state;
  const totalSteps = 4;
  const isLastStep = currentStep === totalSteps;

  const stepLabels = ['Basic Info', 'Search Settings', 'AI Configuration', 'Display Config'];

  // Combine step errors with external errors for display
  const allErrors: Record<string, string> = {
    ...stepErrors,
    ...Object.fromEntries(
      Object.entries(externalErrors).filter((entry): entry is [string, string] => entry[1] !== undefined)
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
    setState((prev) => ({
      ...prev,
      formData: { ...prev.formData, [field]: value },
      // Clear error for this field when user updates it
      stepErrors: { ...prev.stepErrors, [field]: undefined },
    }));
    // Clear submit error when user makes changes
    setSubmitError(null);
  }, []);

  /**
   * Set an external error for a field (e.g., from async validation)
   */
  const setExternalError = useCallback((field: string, error: string | undefined) => {
    setExternalErrors((prev) => ({ ...prev, [field]: error }));
  }, []);

  // ========================================================================
  // VALIDATION
  // ========================================================================

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
          name: formData.name,
          slug: formData.slug,
          description: formData.description,
          indexes: formData.indexes,
        };
        break;
      case 2:
        schema = wizardStep2Schema;
        dataToValidate = {
          searchConfig: formData.searchConfig,
          allowedOrigins: formData.allowedOrigins,
        };
        break;
      case 3:
        schema = wizardStep3Schema;
        dataToValidate = {
          aiConfig: formData.aiConfig,
          toolsConfig: formData.toolsConfig,
        };
        break;
      case 4:
        schema = wizardStep4Schema;
        dataToValidate = {
          displayConfig: formData.displayConfig,
        };
        break;
      default:
        return true;
    }

    // Check external errors (e.g., slug availability)
    const hasExternalErrors = step === 1 && externalErrors.slug;

    const result = schema.safeParse(dataToValidate);

    if (result.success && !hasExternalErrors) {
      // Clear errors for this step
      setState((prev) => ({
        ...prev,
        stepErrors: {},
        stepValidated: { ...prev.stepValidated, [step]: true },
      }));
      return true;
    }

    // Convert Zod errors to simple field -> message map
    const errors: StepErrors = {};
    if (!result.success) {
      result.error.errors.forEach((err) => {
        const field = err.path.join('.');
        if (!errors[field]) {
          errors[field] = err.message;
        }
      });
    }

    // Add external errors
    if (hasExternalErrors && externalErrors.slug) {
      errors.slug = externalErrors.slug;
    }

    setState((prev) => ({
      ...prev,
      stepErrors: errors,
      stepValidated: { ...prev.stepValidated, [step]: true },
    }));

    return false;
  }, [formData, externalErrors]);

  // ========================================================================
  // NAVIGATION
  // ========================================================================

  const handleNext = useCallback(() => {
    const isValid = validateStep(currentStep);
    if (isValid && currentStep < totalSteps) {
      setState((prev) => ({
        ...prev,
        currentStep: prev.currentStep + 1,
        stepErrors: {}, // Clear errors when moving forward
      }));
    }
  }, [currentStep, totalSteps, validateStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      setState((prev) => ({
        ...prev,
        currentStep: prev.currentStep - 1,
        stepErrors: {}, // Clear errors when going back
      }));
    }
    setSubmitError(null);
  }, [currentStep]);

  // ========================================================================
  // SUBMISSION
  // ========================================================================

  const handleCreate = useCallback(async () => {
    // Validate current step first
    const isValid = validateStep(currentStep);
    if (!isValid) return;

    // Build the DTO for API submission
    const createData: CreateSearchExperienceDTO = {
      name: formData.name,
      slug: formData.slug,
      description: formData.description || undefined,
      searchConfig: formData.searchConfig,
      aiConfig: formData.aiConfig,
      toolsConfig: formData.toolsConfig,
      allowedOrigins: formData.allowedOrigins,
      displayConfig: formData.displayConfig,
      indexes: formData.indexes,
    };

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Call API directly (not through mutation hook to avoid duplicate toasts)
      const newExperience = await searchExperiencesApi.create(createData);

      // Invalidate queries manually
      queryClient.invalidateQueries({ queryKey: searchExperienceKeys.lists() });

      // Show single success toast
      toast.success(`Search experience "${newExperience.name}" created successfully`);

      // Mark as redirecting to keep loading state
      isRedirecting.current = true;

      // Navigate to the detail page
      router.push(`${basePath}/${newExperience.id}`);

      // Note: We don't setIsSubmitting(false) here because we want to keep
      // the loading state until the page transitions
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create search experience';
      setSubmitError(message);
      toast.error(message);
      setIsSubmitting(false);
    }
  }, [currentStep, formData, validateStep, queryClient, router]);

  // ========================================================================
  // RENDER
  // ========================================================================

  // Show loading if submitting OR redirecting
  const showLoading = isSubmitting || isRedirecting.current;

  // Step icons for header
  const stepIcons = {
    1: Info,
    2: Settings,
    3: Brain,
    4: Layout,
  };
  const StepIcon = stepIcons[currentStep as keyof typeof stepIcons];

  return (
    <Card className="border-border/60 shadow-sm rounded-2xl w-full max-w-4xl">
      <CardHeader className="border-b border-border/40 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <StepIcon className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold">
                {currentStep === 1 && 'Basic Information'}
                {currentStep === 2 && 'Search Settings'}
                {currentStep === 3 && 'AI Configuration'}
                {currentStep === 4 && 'Display Configuration'}
              </CardTitle>
              <CardDescription className="mt-0.5 text-sm">
                {currentStep === 1 && 'Configure the name, slug, and connected search indexes'}
                {currentStep === 2 && 'Set up pagination, highlighting, and multi-index behavior'}
                {currentStep === 3 && 'Configure AI summaries and chat capabilities'}
                {currentStep === 4 && 'Configure how search results are displayed (optional)'}
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(listPath ?? basePath)}
            className="text-muted-foreground hover:text-foreground rounded-lg"
            disabled={showLoading}
          >
            Cancel
          </Button>
        </div>

        <StepProgress currentStep={currentStep} steps={stepLabels} />
      </CardHeader>

      <CardContent className="pt-4 pb-4">
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
        {currentStep === 3 && (
          <StepAIConfig
            formData={formData}
            errors={allErrors}
            updateField={updateFormData}
          />
        )}
        {currentStep === 4 && (
          <StepDisplayConfig
            formData={formData}
            errors={allErrors}
            updateField={updateFormData}
          />
        )}
      </CardContent>

      <CardFooter className="border-t border-border/40 pt-4 flex items-center justify-between">
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
                Create Experience
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
