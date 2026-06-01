import { config } from "dotenv";
import { defineConfig } from 'drizzle-kit';

// Load environment variables from .env.local
config({
  path: ".env",
});

export default defineConfig({
  // Set the output directory for migrations to match what's used in migrate.ts
  out: './db/drizzle-analytics',
  // Source of the schema definition
  schema: './db/analytics-schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.ANALYTICS_POSTGRES_URL!,
  },
});
