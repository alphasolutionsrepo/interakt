// db/index.ts

import "server-only";

/**
 * Database Connection
 * Drizzle ORM setup with postgres
 * Supports both main database and analytics database
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { databaseConfig } from '../config';
import * as schema from './schema';

// ============================================================================
// LOGGER (simple console logger for now)
// ============================================================================

const logger = {
  info: (message: string, data?: any) => {
    console.log(`[DB INFO] ${message}`, data || '');
  },
  error: (message: string, error: Error) => {
    console.error(`[DB ERROR] ${message}`, error.message);
  },
  warn: (message: string) => {
    console.warn(`[DB WARN] ${message}`);
  }
};

// ============================================================================
// CONNECTION CLIENTS
// ============================================================================

/**
 * Main Database Client
 */
const mainClient = postgres(
  databaseConfig.connection.url,
  {
    max: databaseConfig.connection.pool.max,
    idle_timeout: Math.floor(databaseConfig.connection.pool.idleTimeoutMillis / 1000), // Convert to seconds
    connect_timeout: Math.floor(databaseConfig.connection.pool.connectionTimeoutMillis / 1000),
    onnotice: () => { }, // Suppress notices in development
  }
);

/**
 * Analytics Database Client (if configured)
 */
let analyticsClient: postgres.Sql | null = null;
if (databaseConfig.analytics.url) {
  analyticsClient = postgres(
    databaseConfig.analytics.url,
    {
      max: 5,
      onnotice: () => { },
    }
  );
}

// ============================================================================
// DRIZZLE INSTANCES
// ============================================================================

/**
 * Main Database Instance (with schema)
 */
export const db = drizzle(mainClient, {
  schema,
  logger: databaseConfig.drizzle.logger,
});

/**
 * Analytics Database Instance (without main schema)
 */
export const analyticsDB = analyticsClient
  ? drizzle(analyticsClient, {
    logger: databaseConfig.drizzle.logger,
  })
  : null;

// Log initialization
if (databaseConfig.drizzle.logger) {
  logger.info('Database connections initialized', {
    mainDB: '✓',
    analyticsDB: analyticsClient ? '✓' : '✗ (not configured)',
  });
}

// ============================================================================
// CONNECTION TESTING
// ============================================================================

/**
 * Test main database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    await mainClient`SELECT NOW()`;
    logger.info('Main database connection successful');
    return true;
  } catch (error) {
    logger.error('Main database connection failed', error as Error);
    return false;
  }
}

/**
 * Test analytics database connection
 */
export async function testAnalyticsConnection(): Promise<boolean> {
  if (!analyticsClient) {
    logger.warn('Analytics database not configured');
    return false;
  }

  try {
    await analyticsClient`SELECT NOW()`;
    logger.info('Analytics database connection successful');
    return true;
  } catch (error) {
    logger.error('Analytics database connection failed', error as Error);
    return false;
  }
}

/**
 * Close database connections (for graceful shutdown)
 */
export async function closeDatabase(): Promise<void> {
  try {
    await mainClient.end();
    if (analyticsClient) {
      await analyticsClient.end();
    }
    logger.info('Database connections closed');
  } catch (error) {
    logger.error('Error closing database connections', error as Error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Export schema for use in features
export { schema };

// Export types
export type Database = typeof db;
export type AnalyticsDatabase = typeof analyticsDB;