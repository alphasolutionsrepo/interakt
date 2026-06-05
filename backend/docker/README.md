# Docker

This folder holds **all** Docker artifacts for the backend, split by environment:

| File | Environment | Purpose |
|---|---|---|
| `Dockerfile` | **production** | The app image (Next.js `next start` + migration tooling). Built to a registry and run on Azure Container Apps. Build context is `backend/` (`.dockerignore` lives at the backend root). |
| `docker-compose.dev.yml` | **local dev only** | Postgres (pgvector), pgAdmin, Elasticsearch for working on a fresh clone. Never used in production. |
| `init-db/01-init.sh` | local dev only | Creates `interakt` + `interakt_analytics` and enables pgvector on first Postgres boot. |

## Local development

From `backend/`:

```bash
npm run infra:up      # start postgres + pgadmin + elasticsearch
npm run infra:down    # stop (keeps volumes)
npm run infra:reset   # stop AND wipe volumes
```

| Service | Port | Notes |
|---|---|---|
| Postgres (pgvector pg17) | 5432 | `postgres` / `postgres`; init script creates both DBs + pgvector |
| pgAdmin 4 | 5050 | `admin@localhost.com` / `admin` |
| Elasticsearch 9.3.3 | 9200 | single-node, security disabled |

If you already have Postgres + a search backend (or point at managed Azure ones), skip this and just edit `backend/.env`.

## Production

The production image is built from `docker/Dockerfile` (e.g. `az acr build --file docker/Dockerfile <context=backend>`), pushed to a shared registry, and deployed per-customer on Azure Container Apps. Infrastructure-as-code lives in the separate **interakt-azure-deploy** repo; production uses managed Postgres + Azure AI Search (or Elasticsearch), not this compose stack.

The image runs `next start`; database migrations run as an init container via `node scripts/db-migrate.js apply` (+ analytics) before the app starts.
