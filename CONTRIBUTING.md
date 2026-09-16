# Contributing to Interakt

Thanks for your interest in contributing! This guide covers how to get set up,
the conventions we follow, and what we expect on a pull request.

## Local development

**Prerequisites:** Node.js 24 (see [`.nvmrc`](.nvmrc)) and Docker + Docker Compose.

### Backend (admin dashboard + APIs)

```bash
cd backend

# Runtime config — fill in the three openssl-generated secrets at the top of the file
cp .env.example .env

# Admin user — change at least the password
cp setup/setup.config.example.yaml setup/setup.config.yaml

npm install
npm run infra:up      # local Postgres (pgvector), pgAdmin and Elasticsearch in Docker
npm run dev           # dev server on http://localhost:3000
```

On first `npm run dev` the server automatically:

1. Applies Drizzle migrations to both databases (main + analytics).
2. Seeds the AI provider catalog and prompt templates.
3. Creates the admin user from `setup/setup.config.yaml`.

Sign in at http://localhost:3000 with the admin email and password from your YAML.

| Script | What it does |
|---|---|
| `npm run dev` | Start dev server (auto-migrates + auto-seeds + auto-creates admin) |
| `npm run infra:up` | Start the local Docker stack (Postgres + pgAdmin + Elasticsearch) |
| `npm run infra:down` | Stop containers, keep volumes |
| `npm run infra:reset` | Stop and wipe volumes (fresh DB on next boot) |
| `npm run lint` / `lint:fix` / `lint:strict` | Lint |
| `npm run format` | Prettier |
| `npm run type-check` | TypeScript no-emit check |
| `npm run test` / `test:watch` / `test:coverage` | Vitest |

**Bring your own Postgres / Elasticsearch.** If you already have services running, skip
`npm run infra:up` and point `POSTGRES_URL`, `ANALYTICS_POSTGRES_URL` and `ELASTICSEARCH_URL`
in `.env` at your endpoints. `npm run dev` still handles migrations and seeding.

### Initial setup in the admin UI

Go to **Platform → Initial Setup** (or open http://localhost:3000/setup directly) and:

1. **Configure an AI provider** — Ollama for local/free, OpenAI for cloud. This is required:
   until a provider is configured and set as the system default, the in-app docs and help
   assistant are unavailable, because the docs are indexed with the default provider's
   embedding model.
2. **Load the Fashion Catalog demo data** — sample content plus ready-made Search and AI
   experiences with access tokens, which is exactly what the demo site needs.

Then open http://localhost:3000/docs and spend ten minutes on
[What is Interakt](http://localhost:3000/docs/getting-started/what-is-interakt) and
[Architecture](http://localhost:3000/docs/getting-started/architecture) before clicking around
the admin. The **?** icon on any admin screen opens the docs page for what you're looking at,
plus an **Ask** tab backed by Interakt's own assistant running over the docs.

### Demo site (reference integration)

```bash
cd demo-site
npm install
npm run dev           # http://localhost:3001, talks to the backend on :3000 by default
```

Each demo route is a separate experience and needs its own access token, issued in the admin
UI (loading the Fashion Catalog above is the fastest way to get them). Open a route, click the
gear icon, paste the backend URL and the matching token, and save. Settings persist in
localStorage, one per route.

| Route | Token type |
|---|---|
| `/search-interface`, `/experience/smart-search`, `/experience/guided-search` | Search Experience |
| `/chat` | AI Experience |
| `/dropin-demo` | Search and/or AI Experience |

### Widgets and docs site

- `backend/widgets/` is its own npm package (Preact, built with Vite). `npm run build` there
  emits `dist/widgets.js` and copies it into `backend/public/embed/v1/`. See its
  [README](backend/widgets/README.md).
- `docs-site/` is the Docusaurus shell behind [docs.interakt.app](https://docs.interakt.app).
  The content lives in `backend/src/content/docs/` and is copied in by CI — edit it there.

## Repo layout

```
interakt/
├── backend/               # Next.js admin dashboard + REST APIs (Drizzle, Postgres + Elasticsearch/Azure AI Search)
│   ├── widgets/           # Embeddable drop-in search/chat widgets (Preact) — its own package
│   ├── docker/            # Production Dockerfile + local docker-compose stack
│   └── src/content/docs/  # Documentation source (served in-app at /docs, published to docs.interakt.app)
├── demo-site/             # Example consumer app built against the Interakt APIs
└── docs-site/             # Docusaurus + Redocusaurus shell for docs.interakt.app
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

1. Branch from `main` (the default branch): `git checkout -b feature/your-change`.
2. Make your change. Add or update tests for any non-trivial logic (see below).
3. Run the full local check before opening a PR:

   ```bash
   cd backend
   npm run lint          # eslint
   npm run type-check    # tsc --noEmit
   npm test              # vitest
   ```

   If you touched `backend/widgets/`, also run `npm --prefix widgets run build && npm --prefix widgets test`.
4. Open a PR against `main`. CI (lint · type-check · test, for both backend and widgets)
   must pass.

## Code review

Every review thread has to be resolved before a PR can merge — this is enforced on `main`. So
that the rule doesn't turn every passing remark into a blocker, prefix comments with intent:

- `nit:` — style or taste. The author may resolve it without changing anything.
- `suggestion:` — a concrete improvement worth weighing, but not blocking.
- `question:` — wants an answer, not necessarily a code change.
- `issue:` — blocking. Fix it, or agree explicitly to drop it, before merge.

**Who resolves:** the author, once they've addressed the comment *and* replied saying how. If
the reply doesn't settle things, the reviewer re-opens the thread. Don't resolve a thread
without responding to it — a silent resolve reads as dismissing the feedback.

`main` requires linear history, so PRs land by **squash** or **rebase**; merge commits are
disabled. If `main` moves while your PR is open, rebase onto it rather than merging it in.

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
