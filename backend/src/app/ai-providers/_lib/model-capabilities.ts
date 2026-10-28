// src/app/ai-providers/_lib/model-capabilities.ts

/** The model form's reasoning choice: 'default' sends nothing to the model. */
export type ReasoningChoice = 'default' | 'none' | 'minimal' | 'low' | 'medium' | 'high';

/**
 * Capabilities from the model form's flat fields. The server replaces a model's
 * capabilities on update, so a choice left out here is cleared.
 */
export function capabilitiesFromForm(data: {
    usesCompletionTokens?: boolean;
    noTemperature?: boolean;
    reasoningEffort?: ReasoningChoice;
}): Record<string, unknown> {
    const capabilities: Record<string, unknown> = {};
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
    return typeof effort === 'string' && ['none', 'minimal', 'low', 'medium', 'high'].includes(effort)
        ? (effort as ReasoningChoice)
        : 'default';
}
