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
 * In development, Next reloads server modules on every code change. A client
 * created at module level would then open a fresh pool per reload while the old
 * pools stay connected, until Postgres refuses connections ("too many clients").
 * Pinning the clients to globalThis makes every reload reuse the same pools.
 */
const globalDb = globalThis as typeof globalThis & {
  __interaktDbClients?: { main: postgres.Sql; analytics: postgres.Sql | null };
};

function createClients() {
  /**
   * Main Database Client
   */
  const main = postgres(
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
  const analytics = databaseConfig.analytics.url
    ? postgres(
      databaseConfig.analytics.url,
      {
        max: databaseConfig.analytics.poolMax,
        idle_timeout: Math.floor(databaseConfig.connection.pool.idleTimeoutMillis / 1000),
        connect_timeout: Math.floor(databaseConfig.connection.pool.connectionTimeoutMillis / 1000),
        onnotice: () => { },
      }
    )
    : null;

  return { main, analytics };
}

const clients = globalDb.__interaktDbClients ?? createClients();
if (process.env.NODE_ENV !== 'production') globalDb.__interaktDbClients = clients;

const mainClient = clients.main;
const analyticsClient = clients.analytics;

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