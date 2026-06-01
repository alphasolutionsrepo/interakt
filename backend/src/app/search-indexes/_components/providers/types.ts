// app/search-indexes/_components/providers/types.ts

/**
 * Provider UI Registry Types
 *
 * Defines the contract for provider-specific UI components.
 * Each search provider registers its own settings forms and field settings.
 */

import type { z } from 'zod';

/**
 * Props for provider-specific index settings form.
 * Rendered in Step 2 of the create wizard and on the index edit page.
 */
export interface ProviderSettingsFormProps {
    value: Record<string, unknown>;
    onChange: (value: Record<string, unknown>) => void;
    errors?: Record<string, string>;
}

/**
 * Props for provider-specific field settings.
 * Rendered in the field settings popover in FieldMappingTable.
 */
export interface ProviderFieldSettingsProps {
    fieldName: string;
    fieldType: string;
    value: Record<string, unknown>;
    onChange: (value: Record<string, unknown>) => void;
}

/**
 * Props for the read-only provider settings display (used on the index detail page).
 */
export interface ProviderSettingsDisplayProps {
    settings: Record<string, unknown>;
}

/**
 * Registration for a provider's UI components and metadata.
 */
export interface ProviderUIRegistration {
    /** Provider type key (matches backend SearchProviderType) */
    type: string;
    /** Human-readable label */
    label: string;
    /** Short description for selection UI */
    description: string;
    /** Index-level settings form component */
    SettingsForm: React.ComponentType<ProviderSettingsFormProps>;
    /** Read-only settings display for the index detail page (optional) */
    SettingsDisplay?: React.ComponentType<ProviderSettingsDisplayProps>;
    /** Per-field settings component (optional — not all providers have field-level settings) */
    FieldSettings?: React.ComponentType<ProviderFieldSettingsProps>;
    /** Zod schema for validating provider settings */
    settingsSchema: z.ZodSchema;
    /** Default values for provider settings */
    defaultSettings: Record<string, unknown>;
}
