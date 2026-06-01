// app/search-indexes/_components/providers/azure-ai-search/index.ts

/**
 * Azure AI Search Provider UI Registration
 *
 * Auto-registers the Azure AI Search UI components with the provider registry.
 * Import this module to ensure Azure provider UI is available.
 */

import { registerProviderUI } from '../provider-registry';
import { AzureSettingsForm } from './AzureSettingsForm';
import { AzureSettingsDisplay } from './AzureSettingsDisplay';
import { AzureFieldSettings } from './AzureFieldSettings';
import { azureSettingsSchema, AZURE_DEFAULT_SETTINGS } from './azure-schema';

registerProviderUI({
    type: 'azure-ai-search',
    label: 'Azure AI Search',
    description: 'Microsoft Azure\'s fully managed cloud search with built-in AI enrichment and native hybrid search.',
    SettingsForm: AzureSettingsForm,
    SettingsDisplay: AzureSettingsDisplay,
    FieldSettings: AzureFieldSettings,
    settingsSchema: azureSettingsSchema,
    defaultSettings: AZURE_DEFAULT_SETTINGS,
});

export { AzureSettingsForm } from './AzureSettingsForm';
export { AzureSettingsDisplay } from './AzureSettingsDisplay';
export { AzureFieldSettings } from './AzureFieldSettings';
export { azureSettingsSchema, AZURE_DEFAULT_SETTINGS } from './azure-schema';
