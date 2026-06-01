// src/shared/setup/auto-migrate.ts

/**
 * Dev-only auto-migration runner.
 *
 * Applies Drizzle migrations to both the main DB and the analytics DB on
 * server startup. Guarded by NODE_ENV so it never runs in production.
 *
 * Production deploys still use explicit migration commands.
 */

import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('auto-migrate');

async function migrateOne(connectionString: string | undefined, folder: string, label: string): Promise<void> {
  if (!connectionString) {
    logger.warn(`Skipping ${label} migrations — no connection string set`);
    return;
  }

  const start = Date.now();
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    await migrate(db, { migrationsFolder: folder });
    logger.info(`${label} migrations applied`, { durationMs: Date.now() - start });
  } finally {
    await client.end();
  }
}

export async function runDevMigrations(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  try {
    await migrateOne(process.env.POSTGRES_URL, './db/drizzle', 'main');
    await migrateOne(process.env.ANALYTICS_POSTGRES_URL, './db/drizzle-analytics', 'analytics');
  } catch (err) {
    logger.error('Auto-migration failed — start the server with NODE_ENV=production or run `npm run db:migrate-all` manually', err as Error);
    throw err;
  }
}
