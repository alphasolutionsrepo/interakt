# syntax=docker/dockerfile:1
#
# Production image for the Interakt backend (Next.js 16).
#
# One image serves two roles in a deployment:
#   • app container       → `npm run start`            (default CMD below)
#   • migration init job  → `node scripts/db-migrate.js apply \
#                            && node scripts/db-migrate-analytics.js apply`
#     (override the command in your orchestrator; runs to completion, then exits)
#
# We intentionally use `next start` (not `output: 'standalone'`): the migration
# scripts run via tsx and need drizzle-orm/postgres/pg-connection-string/dotenv
# at runtime, which a standalone trace would not reliably include. Instances are
# long-lived, so the slightly larger image is a non-issue.

ARG NODE_IMAGE=node:24-bookworm-slim

############################
# Base
############################
FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

############################
# Dependencies (full — needed to build)
############################
FROM base AS deps
COPY package.json package-lock.json ./
COPY widgets/package.json widgets/package-lock.json ./widgets/
RUN npm ci
RUN npm --prefix widgets ci

############################
# Builder
############################
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/widgets/node_modules ./widgets/node_modules
COPY . .
# `next build`. Next sets NEXT_PHASE=phase-production-build, which makes
# config/index.ts skip env validation, so the build needs no live secrets.
# The `prebuild` script (re)builds the embeddable widgets first.
RUN npm run build

############################
# Production deps (+ tsx for the migration scripts)
############################
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
 && npm install --no-save tsx@^4 \
 && npm cache clean --force

############################
# Runner
############################
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

# Run as non-root
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# Lean production node_modules (+ tsx) — used by both `next start` and migrations
COPY --from=prod-deps /app/node_modules ./node_modules

# Built application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/package.json ./package.json

# Migration tooling (run standalone via tsx, independent of the Next.js server)
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/db ./db
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# setup/ supplies the local-dev admin-seed YAML path. In managed deployments the
# admin is seeded from SETUP_ADMIN_* env vars instead; the dir is harmless here.
COPY --from=builder /app/setup ./setup

USER nextjs
EXPOSE 3000

CMD ["npm", "run", "start"]
