#!/usr/bin/env node
/**
 * Analytics Database migration helper script
 * This script simplifies generating and applying Drizzle migrations for Analytics DB
 * 
 * Usage:
 * - Generate migrations:   node scripts/db-migrate-analytics.js generate
 * - Apply migrations:      node scripts/db-migrate-analytics.js apply
 * 
 * npm scripts:
 * - npm run db:generate-analytics
 * - npm run db:migrate-analytics
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
            console.log('📝 Generating Analytics database migration files...');
            execSync('npx drizzle-kit generate --config=./drizzle.analytics.config.ts', { stdio: 'inherit' });
            console.log('✅ Migration files generated successfully');
            break;

        case 'apply':
            console.log('🚀 Applying Analytics database migrations...');
            
            // Check if migrate-analytics.ts exists in scripts folder
            const migratePath = path.join(process.cwd(), 'scripts', 'migrate-analytics.ts');
            if (!fs.existsSync(migratePath)) {
                console.error('❌ migrate-analytics.ts not found at:', migratePath);
                process.exit(1);
            }

            // Try different approaches to run the TypeScript file
            const commands = [
                'npx tsx ./scripts/migrate-analytics.ts',
                'npx ts-node ./scripts/migrate-analytics.ts',
                'node -r esbuild-register ./scripts/migrate-analytics.ts',
                'node --loader ts-node/esm ./scripts/migrate-analytics.ts'
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

            console.log('✅ Analytics migrations applied successfully');
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