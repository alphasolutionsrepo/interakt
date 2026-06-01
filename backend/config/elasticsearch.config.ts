// config/elasticsearch.config.ts

/**
 * Elasticsearch Configuration
 * Handles ES connection settings from environment variables
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ElasticsearchConfig {
    /** Elasticsearch URL */
    url: string;
    /** Authentication */
    auth: {
        username?: string;
        password?: string;
        apiKey?: string;
    };
    /** TLS/SSL settings */
    tls: {
        enabled: boolean;
        /** Skip certificate verification (for local dev) */
        rejectUnauthorized: boolean;
    };
    /** Indexing settings */
    indexing: {
        /** Default batch size for bulk operations */
        batchSize: number;
        /** Maximum documents per upload (Vercel limit consideration) */
        maxDocumentsPerUpload: number;
        /** Maximum file size in bytes (10MB default for Vercel) */
        maxFileSizeBytes: number;
        /** Refresh interval for new documents to be searchable */
        refreshOnComplete: boolean;
    };
    /** Request settings */
    request: {
        /** Request timeout in milliseconds */
        timeout: number;
        /** Max retries for failed requests */
        maxRetries: number;
    };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const elasticsearchConfig: ElasticsearchConfig = {
    url: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',

    auth: {
        username: process.env.ELASTICSEARCH_USERNAME,
        password: process.env.ELASTICSEARCH_PASSWORD,
        apiKey: process.env.ELASTICSEARCH_API_KEY,
    },

    tls: {
        enabled: process.env.ELASTICSEARCH_SSL_ENABLED === 'true',
        rejectUnauthorized: process.env.NODE_ENV === 'production',
    },

    indexing: {
        batchSize: parseInt(process.env.ES_BATCH_SIZE || '500', 10),
        maxDocumentsPerUpload: parseInt(process.env.ES_MAX_DOCUMENTS_PER_UPLOAD || '10000', 10),
        maxFileSizeBytes: parseInt(process.env.ES_MAX_FILE_SIZE_BYTES || String(10 * 1024 * 1024), 10), // 10MB
        refreshOnComplete: process.env.ES_REFRESH_ON_COMPLETE !== 'false',
    },

    request: {
        timeout: parseInt(process.env.ES_REQUEST_TIMEOUT || '30000', 10),
        maxRetries: parseInt(process.env.ES_MAX_RETRIES || '3', 10),
    },
};

// ============================================================================
// VALIDATION
// ============================================================================

export function validateElasticsearchConfig(): void {
    const errors: string[] = [];

    if (!elasticsearchConfig.url) {
        errors.push('ELASTICSEARCH_URL is required');
    }

    // Must have either username/password or API key for auth
    const hasBasicAuth = elasticsearchConfig.auth.username && elasticsearchConfig.auth.password;
    const hasApiKey = elasticsearchConfig.auth.apiKey;

    if (!hasBasicAuth && !hasApiKey) {
        // Allow no auth for local development
        if (process.env.NODE_ENV === 'production') {
            errors.push('Elasticsearch authentication required in production (username/password or apiKey)');
        }
    }

    if (errors.length > 0) {
        throw new Error(`Elasticsearch config validation failed:\n${errors.join('\n')}`);
    }
}
