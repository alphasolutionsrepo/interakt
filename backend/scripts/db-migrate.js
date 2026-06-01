#!/usr/bin/env node
/**
 * Database migration helper script
 * This script simplifies generating and applying Drizzle migrations
 * 
 * Usage:
 * - Generate migrations:   node scripts/db-migrate.js generate
 * - Apply migrations:      node scripts/db-migrate.js apply
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Get the command from command line arguments
const command = process.argv[2];

if (!command) {
  console.error('❌ Command required. Use "generate" to create migration files or "apply" to run migrations.');
  process.exit(1);
}

try {
  switch (command) {
    case 'generate':
      console.log('📝 Generating database migration files...');
      execSync('npx drizzle-kit generate', { stdio: 'inherit' });
      console.log('✅ Migration files generated successfully');
      break;
      
    case 'apply':
      console.log('🚀 Applying database migrations...');
      
      // Check if migrate.ts exists
      const migratePath = path.join(process.cwd(), 'scripts', 'migrate.ts');
      if (!fs.existsSync(migratePath)) {
        console.error('❌ migrate.ts not found at:', migratePath);
        process.exit(1);
      }
      
      // Try different approaches to run the TypeScript file
      const commands = [
        'npx tsx ./scripts/migrate.ts',
        'npx ts-node ./scripts/migrate.ts',
        'node -r esbuild-register ./scripts/migrate.ts',
        'node --loader ts-node/esm ./scripts/migrate.ts'
      ];
      
      let success = false;
      for (const cmd of commands) {
        try {
          console.log(`🔄 Trying: ${cmd}`);
          execSync(cmd, { stdio: 'inherit' });
          success = true;
          break;
        } catch (error) {
          console.log(`⚠️  ${cmd} failed, trying next approach...`);
        }
      }
      
      if (!success) {
        console.error('❌ All TypeScript execution methods failed. Please install tsx or ts-node:');
        console.log('npm install -D tsx');
        console.log('or');
        console.log('npm install -D ts-node');
        process.exit(1);
      }
      
      console.log('✅ Migrations applied successfully');
      break;
      
    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log('Available commands: generate, apply');
      process.exit(1);
  }
} catch (error) {
  console.error('❌ Migration operation failed:', error.message);
  process.exit(1);
}
