// config/app.config.ts

/**
 * Application-wide configuration
 * Centralizes all environment variables and app settings
 */

export const appConfig = {
    // Application Info
    app: {
        name: process.env.NEXT_PUBLIC_APP_NAME || 'Interakt',
        version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    },

    // Feature Flags
    features: {
        enableAnalytics: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true',
        enableChatAgent: process.env.ENABLE_CHAT_AGENT !== 'false', // default true
        enableSemanticSearch: process.env.ENABLE_SEMANTIC_SEARCH === 'true',
        enableAdvancedSearch: process.env.ENABLE_ADVANCED_SEARCH === 'true',
        maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
    },

    // API Settings
    api: {
        timeout: parseInt(process.env.API_TIMEOUT || '30000'), // 30 seconds
        maxRetries: parseInt(process.env.API_MAX_RETRIES || '3'),
        rateLimit: {
            windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute
            maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
        },
    },

    // Pagination Defaults
    pagination: {
        defaultPageSize: parseInt(process.env.DEFAULT_PAGE_SIZE || '25'),
        maxPageSize: parseInt(process.env.MAX_PAGE_SIZE || '100'),
    },

    // File Upload Settings
    uploads: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
        allowedFileTypes: (process.env.ALLOWED_FILE_TYPES || 'jpg,jpeg,png,pdf,doc,docx').split(','),
        uploadDir: process.env.UPLOAD_DIR || './uploads',
    },

    // Security
    security: {
        jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
        jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
        bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10'),
        corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
    },

    // Session
    session: {
        secret: process.env.SESSION_SECRET || 'session-secret',
        maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000'), // 24 hours
    },
} as const;

// Validation function (JWT_SECRET and SESSION_SECRET validation removed - not currently used)
export function validateAppConfig() {
    // No validation currently required
}

export type AppConfig = typeof appConfig;