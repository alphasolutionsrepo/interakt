// src/app/ai-providers/_lib/model-form.ts

import { z } from 'zod';

import type { AIProviderModelResponse, UpdateAIModelInput } from '@/features/ai-providers';

import { capabilitiesFromForm, REASONING_CHOICES, reasoningChoiceOf, type ReasoningChoice } from './model-capabilities';

/**
 * Model form schema. The model key follows the server's rule (any non-empty key):
 * provider keys carry `:` (Ollama tags) and `/` (gateway routes).
 */
export const modelFormSchema = z.object({
    modelKey: z.string()
        .min(1, 'Model key is required')
        .max(100, 'Model key too long'),

    displayName: z.string()
        .min(1, 'Display name is required')
        .max(150, 'Display name too long'),

    description: z.string()
        .max(500, 'Description too long')
        .optional()
        .nullable(),

    modelType: z.enum(['text', 'chat', 'embedding', 'vision']),

    dimensions: z.number()
        .int()
        .positive()
        .max(10000, 'Dimensions value too large')
        .optional()
        .nullable(),

    isAvailable: z.boolean().default(true),

    // Pricing fields for cost estimation
    inputCostPerMillionTokens: z.number()
        .min(0, 'Cost cannot be negative')
        .max(1000, 'Cost seems too high')
        .optional()
        .nullable(),

    outputCostPerMillionTokens: z.number()
        .min(0, 'Cost cannot be negative')
        .max(1000, 'Cost seems too high')
        .optional()
        .nullable(),

    // Capabilities (flattened for form, will be restructured on submit)
    usesCompletionTokens: z.boolean().default(false),
    noTemperature: z.boolean().default(false),
    reasoningEffort: z.enum(REASONING_CHOICES).default('default'),
}).refine(
    (data) => {
        // Dimensions required for embedding models
        if (data.modelType === 'embedding' && !data.dimensions) {
            return false;
        }
        return true;
    },
    {
        message: 'Dimensions is required for embedding models',
        path: ['dimensions'],
    }
);

export type ModelFormData = z.infer<typeof modelFormSchema>;

/**
 * Value of an optional number input: blank is null (no value, and clears a saved
 * one on update), anything else a number. `valueAsNumber` gives NaN for blank,
 * which the schema rejects.
 */
export function optionalNumber(value: unknown): number | null {
    if (value === '' || value === null || value === undefined) return null;
    return Number(value);
}

/** The form's values for a saved model. A price of 0 stays 0: blank would clear it on save. */
export function formValuesOf(model: AIProviderModelResponse): ModelFormData {
    const capabilities = (model.capabilities as Record<string, unknown>) || {};
    return {
        modelKey: model.modelKey,
        displayName: model.displayName,
        description: model.description || '',
        modelType: model.modelType as ModelFormData['modelType'],
        dimensions: model.dimensions || undefined,
        isAvailable: model.isAvailable,
        inputCostPerMillionTokens: model.inputCostPerMillionTokens ?? undefined,
        outputCostPerMillionTokens: model.outputCostPerMillionTokens ?? undefined,
        usesCompletionTokens: capabilities.usesCompletionTokens === true,
        noTemperature: capabilities.noTemperature === true,
        reasoningEffort: reasoningChoiceOf(capabilities),
    };
}

/** What the model form submits: its values, with blank boxes as null. */
export interface ModelFormSubmission {
    modelKey: string;
    displayName: string;
    description?: string | null;
    modelType: 'text' | 'chat' | 'embedding' | 'vision';
    dimensions?: number | null;
    isAvailable: boolean;
    inputCostPerMillionTokens?: number | null;
    outputCostPerMillionTokens?: number | null;
    usesCompletionTokens?: boolean;
    noTemperature?: boolean;
    reasoningEffort?: ReasoningChoice;
}

/**
 * The update request for an edited model. Capabilities start from the saved ones, so
 * those the form doesn't show are kept; the model type can't change after creation.
 */
export function modelUpdateInput(model: AIProviderModelResponse, data: ModelFormSubmission): UpdateAIModelInput {
    return {
        displayName: data.displayName,
        description: data.description,
        // Only update dimensions if it's an embedding model
        dimensions: model.modelType === 'embedding' ? data.dimensions : undefined,
        isAvailable: data.isAvailable,
        inputCostPerMillionTokens: data.inputCostPerMillionTokens,
        outputCostPerMillionTokens: data.outputCostPerMillionTokens,
        capabilities: capabilitiesFromForm(data, (model.capabilities as Record<string, unknown> | undefined) ?? {}),
    };
}
