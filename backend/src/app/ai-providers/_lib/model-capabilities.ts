// src/app/ai-providers/_lib/model-capabilities.ts

import { REASONING_EFFORTS, type ReasoningEffort } from '@/features/ai-providers/ai-providers.validation';

/** The model form's reasoning choices: 'default' sends nothing to the model. */
export const REASONING_CHOICES = ['default', ...REASONING_EFFORTS] as const;
export type ReasoningChoice = 'default' | ReasoningEffort;

/** Dropdown labels, in the order of REASONING_CHOICES; a new level fails to build until it has one. */
export const REASONING_LABELS: Record<ReasoningChoice, string> = {
    default: 'Model default',
    none: 'Off',
    minimal: 'Minimal',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
};

/** The capabilities the model form edits; any other saved ones are kept as they are. */
const FORM_CAPABILITIES = ['usesCompletionTokens', 'noTemperature', 'reasoningEffort'];

/**
 * Capabilities from the model form's flat fields, on top of the model's saved ones.
 * The server replaces a model's capabilities on update, so a form choice left out
 * here is cleared, and saved capabilities the form doesn't show (context window,
 * synced Ollama details) are carried over.
 */
export function capabilitiesFromForm(
    data: {
        usesCompletionTokens?: boolean;
        noTemperature?: boolean;
        reasoningEffort?: ReasoningChoice;
    },
    saved: Record<string, unknown> = {},
): Record<string, unknown> {
    const capabilities: Record<string, unknown> = Object.fromEntries(
        Object.entries(saved).filter(([key]) => !FORM_CAPABILITIES.includes(key)),
    );
    if (data.usesCompletionTokens) capabilities.usesCompletionTokens = true;
    if (data.noTemperature) capabilities.noTemperature = true;
    if (data.reasoningEffort && data.reasoningEffort !== 'default') {
        capabilities.reasoningEffort = data.reasoningEffort;
    }
    return capabilities;
}

/** The form's reasoning choice for a saved model: unset shows as 'default'. */
export function reasoningChoiceOf(capabilities: Record<string, unknown>): ReasoningChoice {
    const effort = capabilities.reasoningEffort;
    return typeof effort === 'string' && (REASONING_EFFORTS as readonly string[]).includes(effort)
        ? (effort as ReasoningEffort)
        : 'default';
}
