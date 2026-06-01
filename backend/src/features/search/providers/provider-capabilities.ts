// src/features/search/providers/provider-capabilities.ts

/**
 * Provider Capabilities - Declarative Feature Descriptors
 *
 * Each search provider declares what it supports via this interface.
 * This enables:
 * - Service layer to make decisions without knowing which provider is active
 * - Frontend to dynamically render provider-specific settings
 * - Validation to enforce provider-appropriate constraints
 *
 * Providers export a capabilities object and return it from getCapabilities().
 */

import type { SearchType, VectorSimilarity } from '@/shared/constants/search-index.constants';

// ============================================================================
// PROVIDER CAPABILITIES
// ============================================================================

/**
 * Declares what a search provider supports and what settings it needs.
 *
 * Each provider exports a static capabilities object. The service layer
 * and frontend use this to adapt behavior without knowing provider internals.
 */
export interface ProviderCapabilities {
    /** Provider type identifier (matches SearchProviderType) */
    type: string;

    /** Human-readable name for UI display */
    displayName: string;

    /** Short description of the provider */
    description: string;

    /** Which search types this provider can execute */
    supportedSearchTypes: SearchType[];

    /** Whether the provider handles hybrid search fusion natively (e.g., Azure RRF) */
    supportsNativeHybrid: boolean;

    /** Whether the provider has a built-in semantic/neural reranker */
    supportsSemanticRanker: boolean;

    /** Whether the provider supports autocomplete via custom analyzers */
    supportsAutocomplete: boolean;

    /** Vector/embedding search configuration */
    vectorConfig: {
        /** Similarity functions the provider supports */
        supportedSimilarities: VectorSimilarity[];
        /** Vector search algorithms available (e.g., ['hnsw'], ['hnsw', 'exhaustiveKnn']) */
        supportedAlgorithms: string[];
        /** Maximum embedding dimensions the provider supports */
        maxDimensions: number;
    };

    /** Document indexing constraints */
    indexing: {
        /** Maximum documents per batch/bulk operation */
        maxDocumentsPerBatch: number;
        /** Whether the provider supports explicit refresh control (ES: true, Azure: false) */
        supportsRefreshControl: boolean;
    };

    /**
     * Which standard field-level attributes this provider supports.
     * The UI uses this to show/hide attribute toggles per provider.
     *
     * Attributes not listed here are always shown (isSearchable, isFacetable,
     * includeInResponse, boostValue, isIndexed, isVectorSource, isRequired).
     *
     * Only attributes that differ between providers need to be declared:
     * - isAutocomplete: ES supports via edge_ngram analyzer; Azure does not
     * - customAnalyzer: ES has standard/autocomplete; Azure has built-in analyzers (different options)
     */
    fieldAttributes: {
        /** Whether this provider supports the isAutocomplete per-field toggle */
        supportsAutocomplete: boolean;
        /** Whether this provider supports custom text analyzers per field */
        supportsCustomAnalyzer: boolean;
        /** Custom analyzer options for this provider (if supported) */
        analyzerOptions?: { value: string; label: string }[];
    };

    /**
     * Provider-specific index settings schema.
     * Describes the settings fields that should appear in the wizard/edit UI.
     * For ES: shards, replicas, refresh interval
     * For Azure: vector algorithm, semantic config
     */
    indexSettingsSchema: ProviderSettingField[];

    /**
     * Provider-specific field-level settings schema.
     * Describes per-field settings that should appear in the field mapping UI.
     * For ES: isAutocomplete, customAnalyzer
     * For Azure: isSortable
     */
    fieldSettingsSchema: ProviderSettingField[];
}

// ============================================================================
// PROVIDER SETTING FIELD DESCRIPTOR
// ============================================================================

/**
 * Describes a single provider-specific setting field.
 * Used by the frontend to dynamically render form inputs.
 */
export interface ProviderSettingField {
    /** Setting key (used in providerSettings JSON) */
    key: string;

    /** Human-readable label for UI */
    label: string;

    /** Longer description/help text */
    description: string;

    /** Input type for the setting */
    type: 'number' | 'string' | 'boolean' | 'select';

    /** Options for 'select' type */
    options?: { value: string; label: string }[];

    /** Minimum value for 'number' type */
    min?: number;

    /** Maximum value for 'number' type */
    max?: number;

    /** Default value for this setting */
    defaultValue: unknown;

    /** Whether changing this setting requires reindexing */
    requiresReindex: boolean;

    /**
     * Condition for when this field should be visible.
     * For example, an Azure field might only appear when searchType is 'hybrid'.
     * If undefined, the field is always visible.
     */
    visibleWhen?: {
        field: string;
        value: unknown;
    };
}
