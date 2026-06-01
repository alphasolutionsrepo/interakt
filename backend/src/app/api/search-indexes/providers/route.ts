// app/api/search-indexes/providers/route.ts

/**
 * Search Providers API Route
 * GET /api/search-indexes/providers - List enabled search providers with capabilities
 */

import { NextResponse } from 'next/server';
import { getEnabledProviderTypes, getSearchEngineProvider } from '@/features/search/providers';

export async function GET() {
    try {
        const enabledTypes = getEnabledProviderTypes();

        const providers = enabledTypes.map(type => {
            try {
                const provider = getSearchEngineProvider(type);
                const capabilities = provider.getCapabilities();
                return {
                    type: capabilities.type,
                    displayName: capabilities.displayName,
                    description: capabilities.description,
                    supportedSearchTypes: capabilities.supportedSearchTypes,
                    supportsNativeHybrid: capabilities.supportsNativeHybrid,
                    supportsSemanticRanker: capabilities.supportsSemanticRanker,
                    supportsAutocomplete: capabilities.supportsAutocomplete,
                    fieldAttributes: capabilities.fieldAttributes,
                    indexSettingsSchema: capabilities.indexSettingsSchema,
                    fieldSettingsSchema: capabilities.fieldSettingsSchema,
                };
            } catch {
                // Provider may not be initialized yet
                return {
                    type,
                    displayName: type,
                    description: `${type} search provider`,
                    supportedSearchTypes: [],
                    supportsNativeHybrid: false,
                    supportsSemanticRanker: false,
                    supportsAutocomplete: false,
                    fieldAttributes: {
                        supportsAutocomplete: false,
                        supportsCustomAnalyzer: false,
                    },
                    indexSettingsSchema: [],
                    fieldSettingsSchema: [],
                };
            }
        });

        return NextResponse.json({ providers });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get providers';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
