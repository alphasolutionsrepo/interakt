// config/database.config.ts

/**
 * Database configuration
 * All database-related settings for PostgreSQL and Drizzle
 */

export const databaseConfig = {
  // Connection
  connection: {
    // Support both DATABASE_URL and POSTGRES_URL (your existing setup uses POSTGRES_URL)
    url: process.env.POSTGRES_URL || process.env.DATABASE_URL || '',
    
    // Connection Pool Settings
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2'),
      max: parseInt(process.env.DB_POOL_MAX || '10'),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
    },
  },

  // Analytics Database (optional)
  analytics: {
    url: process.env.ANALYTICS_POSTGRES_URL || '',
  },

  // Drizzle Settings
  drizzle: {
    // SQL query logging - disabled by default, enable with DB_LOG_QUERIES=true
    logger: process.env.DB_LOG_QUERIES === 'true',
  },

  // Query Settings
  queries: {
    timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000'), // 30 seconds
    maxRetries: parseInt(process.env.DB_MAX_RETRIES || '3'),
  },

  // Migration Settings
  migrations: {
    folder: './db/migrations',
    table: 'drizzle_migrations',
  },
} as const;

// Validation function
export function validateDatabaseConfig() {
  const errors: string[] = [];

  if (!databaseConfig.connection.url) {
    errors.push('DATABASE_URL or POSTGRES_URL must be set');
  }

  // Validate connection string format
  if (databaseConfig.connection.url) {
    try {
      const url = new URL(databaseConfig.connection.url);
      if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
        errors.push('DATABASE_URL must be a valid PostgreSQL connection string');
      }
    } catch (error) {
      errors.push('DATABASE_URL is not a valid URL');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Database configuration errors:\n${errors.join('\n')}`);
  }
}

export type DatabaseConfig = typeof databaseConfig;