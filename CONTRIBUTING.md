# Contributing to Interakt

Thanks for your interest in contributing! This guide covers how to get set up,
the conventions we follow, and what we expect on a pull request.

## Getting started

See the [README](README.md) for full local setup. The short version:

```bash
# Backend (admin + APIs) — http://localhost:3000
cd backend
cp .env.example .env                                   # fill in the generated secrets
cp setup/setup.config.example.yaml setup/setup.config.yaml
npm install
npm run infra:up                                       # local Postgres + Elasticsearch
npm run dev                                            # auto-migrates, seeds, creates admin
```

The demo site (a reference integration) lives in `demo-site/` and runs on port 3001.

**Prerequisites:** Node.js 24 (see [`.nvmrc`](.nvmrc)) and Docker + Docker Compose.

## Repo layout

```
interakt/
├── backend/      # Next.js admin dashboard + REST APIs (Drizzle, Postgres + Elasticsearch/Azure AI Search)
│   └── widgets/  # Embeddable drop-in search/chat widgets (Lit) — its own package
└── demo-site/    # Example consumer app built against the Interakt APIs
```

The backend uses a **feature-sliced architecture** under `backend/src/features/`. Each
feature is self-contained and follows a consistent layering convention:

- `*.service.ts` — business logic
- `*.repository.ts` — database access
- `*.validation.ts` — Zod schemas
- `*.types.ts` — types
- `*.api.handlers.ts` — HTTP handlers
- `index.ts` — the feature's public surface

Shared code lives in `backend/src/shared/`, admin pages in `backend/src/app/`. When adding
to a feature, match the surrounding structure rather than introducing a new pattern.

## Development workflow

1. Branch from `develop` (the default branch): `git checkout -b feature/your-change`.
2. Make your change. Add or update tests for any non-trivial logic (see below).
3. Run the full local check before opening a PR:

   ```bash
   cd backend
   npm run lint          # eslint
   npm run type-check    # tsc --noEmit
   npm test              # vitest
   ```

   If you touched `backend/widgets/`, also run `npm --prefix widgets run build && npm --prefix widgets test`.
4. Open a PR against `develop`. CI (lint · type-check · test, for both backend and widgets)
   must pass.

## Database changes

Schema lives in `backend/db/schema/` (main) and `backend/db/analytics-schema/` (analytics),
managed by Drizzle. After changing a schema:

```bash
cd backend
npm run db:generate            # generate a migration from the schema diff
npm run db:migrate             # apply it locally
# analytics DB equivalents: db:generate-analytics / db:migrate-analytics
```

Commit the generated migration **and** the updated `meta/_journal.json` together — a migration
that isn't in the journal will be silently skipped on a fresh boot. Let `drizzle-kit` generate
migrations; don't hand-author SQL files that aren't wired into the journal.

## Code style

- **Prettier** for formatting (`npm run format`) and **ESLint** for linting. CI runs `npm run lint`,
  which tolerates warnings but not errors; `npm run lint:strict` treats warnings as errors.
- TypeScript throughout. Prefer real types over `any` at module boundaries.
- Keep new code consistent with the file it lives in — naming, comment density, and idiom.

## Tests

We use **vitest**. The strongest coverage is in the pipeline, guardrails, tools, and validation
layers — follow those as examples. Assert on pipeline byproducts (trace, retrieval, citations,
validation results) rather than exact LLM text, and don't treat the AI provider as a test axis.
Tests are pure unit tests (external services are stubbed), so they run without Postgres or
Elasticsearch.

## Commit messages

Write clear, imperative-mood messages that explain the *why*, not just the *what*. Group related
changes into a single commit. Conventional-commit-style prefixes (`feat:`, `fix:`, `chore:`,
`docs:`) are welcome but not required.

## Reporting bugs and requesting features

Open a GitHub issue with steps to reproduce (for bugs) or a clear use case (for features). For
**security** issues, do **not** open a public issue — see [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
