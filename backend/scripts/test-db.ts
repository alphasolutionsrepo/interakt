// scripts/test-db.ts

/**
 * Comprehensive Database Test Script
 * Auto-loads .env, tests connection, verifies schema
 * Run: npx tsx scripts/test-db.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Auto-load .env file
config({ path: resolve(process.cwd(), '.env') });

async function runTests() {
  console.log('==========================================================');
  console.log('  DATABASE CONNECTION TEST');
  console.log('==========================================================\n');

  // ============================================================================
  // STEP 1: Environment Check
  // ============================================================================
  console.log('Step 1: Environment Variables');
  console.log('─────────────────────────────');

  const envVars = {
    NODE_ENV: process.env.NODE_ENV,
    POSTGRES_URL: process.env.POSTGRES_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    ANALYTICS_POSTGRES_URL: process.env.ANALYTICS_POSTGRES_URL,
  };

  let hasRequiredVars = false;
  for (const [key, value] of Object.entries(envVars)) {
    if (value) {
      const masked = value.includes('@')
        ? value.replace(/:[^:@]*@/, ':****@')
        : value;
      console.log(`✓ ${key}: ${masked}`);
      if (key === 'POSTGRES_URL' || key === 'DATABASE_URL') {
        hasRequiredVars = true;
      }
    } else {
      console.log(`✗ ${key}: NOT SET`);
    }
  }

  if (!hasRequiredVars) {
    console.error('\n❌ Missing required environment variables!');
    console.error('   Please set POSTGRES_URL or DATABASE_URL in .env file\n');
    console.error('Example .env:');
    console.error('  POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/interakt\n');
    process.exit(1);
  }

  // ============================================================================
  // STEP 2: Config Loading
  // ============================================================================
  console.log('\nStep 2: Loading Configuration');
  console.log('─────────────────────────────');

  let databaseConfig: any;
  try {
    const configModule = await import('../config');
    databaseConfig = configModule.databaseConfig;

    console.log('✓ Config loaded successfully');
    console.log('  - URL configured:', databaseConfig.connection.url ? 'YES' : 'NO');
    console.log('  - Pool max:', databaseConfig.connection.pool.max);

    if (databaseConfig.connection.url) {
      const masked = databaseConfig.connection.url.replace(/:[^:@]*@/, ':****@');
      console.log('  - Connection string:', masked);
    }
  } catch (error) {
    console.error('✗ Failed to load config');
    console.error('  Error:', (error as Error).message);
    process.exit(1);
  }

  // ============================================================================
  // STEP 3: Raw Connection Test
  // ============================================================================
  console.log('\nStep 3: Testing PostgreSQL Connection');
  console.log('─────────────────────────────────────');

  try {
    const postgres = (await import('postgres')).default;

    const sql = postgres(databaseConfig.connection.url, {
      max: 1,
      idle_timeout: 10,
      connect_timeout: 10,
    });

    console.log('Attempting connection...');
    const result = await sql`SELECT NOW() as current_time, version() as pg_version`;

    console.log('✓ Connection successful!');
    console.log('  - Current time:', result[0].current_time);
    console.log('  - PostgreSQL version:', result[0].pg_version.split(' ').slice(0, 2).join(' '));

    await sql.end();

  } catch (error) {
    const err = error as Error;

    if (err.message.includes('Cannot find module')) {
      console.error('✗ Missing dependency: postgres');
      console.error('\nInstall required packages:');
      console.error('  npm install postgres drizzle-orm');
      console.error('  npm install -D drizzle-kit tsx @types/node dotenv\n');
      process.exit(1);
    }

    console.error('✗ Connection failed');
    console.error('  Error:', err.message);
    console.error('\nCommon causes:');
    console.error('  1. PostgreSQL not running → docker ps | grep postgres');
    console.error('  2. Database does not exist → Create via pgAdmin or docker exec');
    console.error('  3. Wrong credentials → Check .env file');
    console.error('  4. Wrong port → Check docker ps for port mapping\n');
    process.exit(1);
  }

  // ============================================================================
  // STEP 4: Drizzle Setup Test
  // ============================================================================
  console.log('\nStep 4: Testing Drizzle Setup');
  console.log('─────────────────────────────');

  try {
    const dbModule = await import('../db');
    const { db, analyticsDB, testConnection, testAnalyticsConnection, schema } = dbModule;

    // Test main database
    console.log('Testing main database...');
    const mainConnected = await testConnection();
    console.log('  - Main DB:', mainConnected ? '✓ Success' : '✗ Failed');

    if (!mainConnected) {
      console.error('\n✗ Drizzle connection failed');
      process.exit(1);
    }

    // Test analytics database (optional)
    if (analyticsDB) {
      console.log('Testing analytics database...');
      const analyticsConnected = await testAnalyticsConnection();
      console.log('  - Analytics DB:', analyticsConnected ? '✓ Success' : '✗ Failed');
    }

    // Check schema
    console.log('\nSchema verification:');
    console.log('  - Users table:', schema.user ? '✓' : '✗');
    console.log('  - Data templates table:', schema.dataTemplates ? '✓' : '✗');
    console.log('  - Data template fields table:', schema.dataTemplateFields ? '✓' : '✗');
    console.log('  - Relations defined:', schema.dataTemplatesRelations ? '✓' : '✗');

  } catch (error) {
    console.error('✗ Failed to load Drizzle');
    console.error('  Error:', (error as Error).message);
    process.exit(1);
  }

  // ============================================================================
  // STEP 5: Query Test (Optional - tables may not exist yet)
  // ============================================================================
  console.log('\nStep 5: Testing Query Execution');
  console.log('─────────────────────────────────');

  try {
    const { db } = await import('../db');
    const { dataTemplates } = await import('../db/schema');

    const count = await db.select().from(dataTemplates).execute();

    console.log('✓ Query executed successfully');
    console.log('  - Data templates count:', count.length);

    if (count.length > 0) {
      console.log('  - Sample:', count[0].name);
    }

  } catch (error) {
    const err = error as Error;
    if (err.message.includes('does not exist')) {
      console.log('⚠  Tables not created yet (run migrations)');
      console.log('   This is normal for initial setup');
    } else {
      console.error('✗ Query failed:', err.message);
    }
  }

  // ============================================================================
  // SUCCESS
  // ============================================================================
  console.log('\n==========================================================');
  console.log('  ✓ DATABASE SETUP VERIFIED!');
  console.log('==========================================================');
  console.log('\nYour database connection is working!\n');
  console.log('Next steps:');
  console.log('  1. Create drizzle.config.ts (if not exists)');
  console.log('  2. Generate migrations: npx drizzle-kit generate');
  console.log('  3. Run migrations: npx drizzle-kit migrate');
  console.log('  4. Start building features!\n');
}

// Run the tests
runTests()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n✗ Test failed:', error);
    process.exit(1);
  });