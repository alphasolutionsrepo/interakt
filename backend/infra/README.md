# Local dev infrastructure

Local-only Docker stack for the Interakt backend. **Production runs on Azure managed services** — this folder is purely for getting a fresh clone working on your laptop.

If you have your own Postgres + Elasticsearch (or want to point at the shared Azure dev instances), skip this entirely and just edit `backend/.env`.

## What's in the stack

| Service | Port | Notes |
|---|---|---|
| Postgres (pgvector pg17) | 5432 | Creates `interakt` and `interakt_analytics` DBs on first boot via [init-db/01-create-databases.sql](init-db/01-create-databases.sql) |
| pgAdmin 9 | 5050 | `admin@localhost.com` / `admin` |
| Elasticsearch 9.3.3 | 9200 | Single-node, security disabled |
| Kibana 9.3.3 | 5601 | |
| Elasticvue | 5602 | Browser UI for inspecting any ES cluster (handy for the Azure one too) |

## Usage

From the `backend/` folder:

```bash
npm run infra:up      # start everything
npm run infra:down    # stop (keeps volumes)
npm run infra:reset   # stop AND wipe volumes — fresh start
```

Or directly:

```bash
docker compose -f infra/docker-compose.yml up -d
```

## Why both DBs are created in the init script

Postgres images support a single `POSTGRES_DB` env var. Splitting the DB list between an env var and a SQL script would hide one of them. Putting both `CREATE DATABASE` statements in [`init-db/01-create-databases.sql`](init-db/01-create-databases.sql) keeps the source of truth in one obvious file. To add another database, edit that file.
