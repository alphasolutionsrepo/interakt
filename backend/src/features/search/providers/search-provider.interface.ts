// src/features/search/providers/search-provider.interface.ts

/**
 * Search Provider Interface
 *
 * Contract for search providers (Elasticsearch, Azure AI Search).
 */

import type {
    ProviderSearchRequest,
    ProviderSearchResponse,
} from '../search.types';

import type { GetDocumentResult } from './search-engine-provider.interface';

/**
 * Search provider interface
 *
 * Implementations handle the actual search execution against a specific backend.
 */
export interface SearchProvider {
    /**
     * Provider name for logging/debugging
     */
    readonly name: string;

    /**
     * Execute a search query
     */
    search(request: ProviderSearchRequest): Promise<ProviderSearchResponse>;

    /**
     * Check if the provider is available/healthy
     */
    isHealthy(): Promise<boolean>;

    /**
     * Get provider-specific statistics
     */
    getStats?(): Promise<ProviderStats>;

    /**
     * Get distinct values for a field in an index.
     * Used for auto-generating filter canonical values.
     *
     * @param indexName - The search index name
     * @param fieldName - The field to aggregate
     * @param options - Optional configuration
     * @returns Array of distinct values with document counts
     */
    getDistinctValues?(
        indexName: string,
        fieldName: string,
        options?: DistinctValuesOptions
    ): Promise<DistinctValuesResult>;

    /**
     * Execute an autocomplete/suggestion query.
     *
     * @param indexName - The search index name
     * @param query - The partial query text
     * @param fields - Fields to search for autocomplete matches
     * @param options - Autocomplete configuration
     * @returns Matching suggestions with highlights
     */
    autocomplete?(
        indexName: string,
        query: string,
        fields: string[],
        options?: AutocompleteOptions
    ): Promise<AutocompleteResult>;

    /**
     * Get a single document by ID with optional field filtering.
     *
     * @param indexName - The search index name
     * @param documentId - The document ID to retrieve
     * @param sourceFields - Optional list of fields to include (all if omitted)
     * @returns The document if found
     */
    getDocument?(
        indexName: string,
        documentId: string,
        sourceFields?: string[]
    ): Promise<GetDocumentResult>;
}

/**
 * Options for retrieving distinct field values
 */
export interface DistinctValuesOptions {
    /** Maximum number of distinct values to return (default: 200) */
    maxValues?: number;
    /** Minimum document count for a value to be included (default: 1) */
    minDocCount?: number;
}

/**
 * Result of a distinct values query
 */
export interface DistinctValuesResult {
    /** The field that was aggregated */
    fieldName: string;
    /** Distinct values with their document counts */
    values: DistinctFieldValue[];
    /** Total number of distinct values (may be more than returned) */
    totalDistinct: number;
}

/**
 * A single distinct value with its document count
 */
export interface DistinctFieldValue {
    /** The field value */
    value: string;
    /** Number of documents with this value */
    count: number;
}

/**
 * Provider statistics
 */
export interface ProviderStats {
    /** Provider name */
    provider: string;

    /** Connection status */
    connected: boolean;

    /** Cluster/service health */
    health?: 'green' | 'yellow' | 'red' | 'unknown';

    /** Additional provider-specific info */
    info?: Record<string, unknown>;
}

// ============================================================================
// AUTOCOMPLETE TYPES
// ============================================================================

/**
 * Options for autocomplete/suggestion queries
 */
export interface AutocompleteOptions {
    /** Maximum number of suggestions to return */
    maxSuggestions?: number;
    /** Analyzer to use for the autocomplete query */
    analyzer?: string;
    /** HTML tag to wrap highlighted matches (opening) */
    highlightPreTag?: string;
    /** HTML tag to wrap highlighted matches (closing) */
    highlightPostTag?: string;
}

/**
 * Result of an autocomplete query
 */
export interface AutocompleteResult {
    /** Matching document suggestions */
    hits: AutocompleteHit[];
}

/**
 * A single autocomplete suggestion hit
 */
export interface AutocompleteHit {
    /** Document ID */
    id: string;
    /** Relevance score */
    score: number;
    /** Document source fields */
    source: Record<string, unknown>;
    /** Highlighted field snippets */
    highlights?: Record<string, string[]>;
}

/**
 * Provider factory type
 */
export type SearchProviderFactory = () => SearchProvider;

/**
 * Provider registry for multiple backends
 */
export class SearchProviderRegistry {
    private providers: Map<string, SearchProvider> = new Map();
    private defaultProvider: string | null = null;

    /**
     * Register a provider
     */
    register(name: string, provider: SearchProvider, isDefault = false): void {
        this.providers.set(name, provider);
        if (isDefault || !this.defaultProvider) {
            this.defaultProvider = name;
        }
    }

    /**
     * Get a provider by name
     */
    get(name?: string): SearchProvider | null {
        const providerName = name || this.defaultProvider;
        if (!providerName) return null;
        return this.providers.get(providerName) || null;
    }

    /**
     * Get the default provider
     */
    getDefault(): SearchProvider | null {
        return this.get();
    }

    /**
     * List registered providers
     */
    list(): string[] {
        return Array.from(this.providers.keys());
    }

    /**
     * Check if a provider exists
     */
    has(name: string): boolean {
        return this.providers.has(name);
    }
}

// Global provider registry instance (use globalThis to survive Next.js module re-evaluation)
const REGISTRY_KEY = '__searchProviderRegistry__';
export const providerRegistry: SearchProviderRegistry =
    (globalThis as Record<string, unknown>)[REGISTRY_KEY] as SearchProviderRegistry
    ?? ((globalThis as Record<string, unknown>)[REGISTRY_KEY] = new SearchProviderRegistry());
