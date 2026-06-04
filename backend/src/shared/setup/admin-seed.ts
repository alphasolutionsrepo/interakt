// src/shared/setup/admin-seed.ts

/**
 * On-boot admin seeder.
 *
 * Creates the admin user in the DB if no admin exists yet. Idempotent — if any
 * admin row is present, this is a no-op.
 *
 * Two credential sources, in priority order:
 *   1. Environment variables (`SETUP_ADMIN_EMAIL` + `SETUP_ADMIN_PASSWORD`,
 *      optional `SETUP_ADMIN_FIRST_NAME` / `SETUP_ADMIN_LAST_NAME`). Used for
 *      managed/container deployments where per-instance credentials are injected
 *      from a secret store (e.g. Azure Key Vault) rather than baked into the image.
 *   2. `setup/setup.config.yaml` — the local-dev path, unchanged, so the first
 *      `npm run dev` boots into a logged-in-ready state.
 *
 * The password is always validated before seeding, so we never seed a default.
 */

import 'server-only';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '@/db/index';
import { user } from '@/db/schema/users.schema';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('admin-seed');

const adminConfigSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'admin.password must be at least 8 characters'),
  firstName: z.string().min(1).max(100).default('Admin'),
  lastName: z.string().min(1).max(100).default('User'),
});

// Top-level schema is permissive — Phase 3 left other sections in the YAML
// and we don't want a stale file to break boot. Only `admin` is consumed.
const yamlSchema = z.object({ admin: adminConfigSchema.optional() }).passthrough();

type AdminConfig = z.infer<typeof adminConfigSchema>;

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'must be at least 8 characters';
  if (!/(?=.*[a-z])/.test(password)) return 'must contain a lowercase letter';
  if (!/(?=.*[A-Z])/.test(password)) return 'must contain an uppercase letter';
  if (!/(?=.*\d)/.test(password)) return 'must contain a digit';
  return null;
}

/**
 * Resolve admin credentials from environment variables, if present.
 * Returns null when the required env vars are not set (so we fall back to YAML).
 */
function getAdminFromEnv(): AdminConfig | null {
  const email = process.env.SETUP_ADMIN_EMAIL?.trim();
  const password = process.env.SETUP_ADMIN_PASSWORD;
  if (!email || !password) return null;

  const parsed = adminConfigSchema.safeParse({
    email,
    password,
    firstName: process.env.SETUP_ADMIN_FIRST_NAME?.trim() || undefined,
    lastName: process.env.SETUP_ADMIN_LAST_NAME?.trim() || undefined,
  });
  if (!parsed.success) {
    logger.error(
      'SETUP_ADMIN_* env vars failed validation',
      new Error(JSON.stringify(parsed.error.issues)),
    );
    return null;
  }
  return parsed.data;
}

/** Hash the password and insert the admin row. */
async function createAdmin(admin: AdminConfig, source: string): Promise<void> {
  const passwordError = validatePassword(admin.password);
  if (passwordError) {
    logger.error(`admin.password (${source}) ${passwordError}`);
    return;
  }

  const hashed = await bcrypt.hash(admin.password, 12);
  const email = admin.email.toLowerCase();

  const [created] = await db
    .insert(user)
    .values({
      email,
      password: hashed,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: 'admin',
      isActive: true,
    })
    .returning();

  logger.info(`Seeded admin user from ${source}`, { id: created.id, email: created.email });
}

export async function seedAdminFromYaml(): Promise<void> {
  // Short-circuit if any admin already exists.
  const existing = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);
  if (existing.length > 0) {
    logger.info('Admin user already exists — skipping seed', { email: existing[0].email });
    return;
  }

  // 1. Prefer environment variables (managed/container deployments).
  const envAdmin = getAdminFromEnv();
  if (envAdmin) {
    await createAdmin(envAdmin, 'environment variables');
    return;
  }

  // 2. Fall back to setup/setup.config.yaml (local-dev path).
  const yamlPath = resolve(process.cwd(), 'setup/setup.config.yaml');
  if (!existsSync(yamlPath)) {
    logger.warn(
      'No admin user found AND setup/setup.config.yaml is missing. ' +
        'Copy setup/setup.config.example.yaml → setup.config.yaml, set admin.email + admin.password, and restart.',
    );
    return;
  }

  const raw = await readFile(yamlPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (e) {
    logger.error('Failed to parse setup.config.yaml', e as Error);
    return;
  }

  const result = yamlSchema.safeParse(parsed ?? {});
  if (!result.success) {
    logger.error('setup.config.yaml validation failed', new Error(JSON.stringify(result.error.issues)));
    return;
  }

  const admin = result.data.admin;
  if (!admin) {
    logger.warn(
      'setup.config.yaml has no `admin:` block. Add email + password and restart to seed the admin user.',
    );
    return;
  }

  await createAdmin(admin, 'setup.config.yaml');
}
