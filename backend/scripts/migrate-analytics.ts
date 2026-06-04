// scripts/migrate-analytics.ts

/**
 * Analytics Database Migration Runner
 * 
 * Applies Drizzle migrations to the Analytics PostgreSQL database.
 * This is a SEPARATE database from the main app database.
 * 
 * Usage: npx tsx ./scripts/migrate-analytics.ts
 *    or: npm run db:migrate-analytics
 */

import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Load environment variables
config({ path: '.env' });

const connectionString = process.env.ANALYTICS_POSTGRES_URL;

if (!connectionString) {
  console.error('❌ ANALYTICS_POSTGRES_URL environment variable is not set');
  process.exit(1);
}

async function runMigrations() {
  console.log('🔄 Connecting to Analytics database...');
  
  // Create a connection for migrations (with max 1 connection). Managed Postgres
  // (e.g. Azure Flexible Server) requires TLS — honor sslmode from the URL.
  const useSsl = /[?&]sslmode=(require|prefer|verify-ca|verify-full)/i.test(connectionString!);
  const migrationClient = postgres(connectionString!, { max: 1, ssl: useSsl ? 'require' : undefined });
  const db = drizzle(migrationClient);

  console.log('📦 Running Analytics database migrations...');
  
  try {
    await migrate(db, {
      migrationsFolder: './db/drizzle-analytics',
    });
    
    console.log('✅ Analytics database migrations completed successfully!');
  } catch (error) {
    console.error('❌ Analytics migration failed:', error);
    process.exit(1);
  } finally {
    // Close the connection
    await migrationClient.end();
  }
  
  process.exit(0);
}

runMigrations();