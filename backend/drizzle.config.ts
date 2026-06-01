import { config } from "dotenv";
import { defineConfig } from 'drizzle-kit';

config({ path: ".env" });

export default defineConfig({
  out: './db/drizzle',
  schema: './db/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.POSTGRES_URL!,
  },
});