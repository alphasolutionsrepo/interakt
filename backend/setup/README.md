# Setup

Everything a first-time user needs to get Interakt running with a working demo.

## Files

| File | Purpose |
|---|---|
| [setup.config.example.yaml](setup.config.example.yaml) | Template — admin email/password. Copy to `setup.config.yaml`. |
| [setup.config.yaml](setup.config.yaml) | **Gitignored.** Your real config. The server reads `admin:` from it on first boot. |
| [data/demo.manifest.yaml](data/demo.manifest.yaml) | The demo declaration: provider defaults, index, tools, search + chat experiences. Consumed by the **Demo Setup** admin page — and doubles as your manual-setup reference. |
| [data/fashion_catalog_index_mapping.json](data/fashion_catalog_index_mapping.json) | The 35 field mappings for the demo index (referenced by the manifest). |
| [data/fashion_catalog.json](data/fashion_catalog.json) | 200 product documents (referenced by the manifest). |

## First-time flow (one demo, configured)

```bash
# 1. Start infra
npm run infra:up                 # Postgres + Elasticsearch

# 2. Put your OpenAI key in ONE place — backend/.env
#    OPENAI_API_KEY=sk-...        (OpenAI is the default provider; ES is the search engine)

# 3. Set the admin login
cp setup/setup.config.example.yaml setup/setup.config.yaml
#    edit it — change at least the admin password

# 4. Run the app
npm run dev                      # http://localhost:3000
```

Then **log in and open `/admin/setup-demo`**, and click **Set up demo**. That configures
the whole Fashion Catalog demo that drives `interakt-demo-script.md`: a hybrid search index,
the 200-product catalog embedded with OpenAI, scaffolded tools, a search experience, and a
deterministic chat experience.

### The Demo Setup page (`/admin/setup-demo`)

| Button | Effect |
|---|---|
| **Set up demo** | Configure the demo. Idempotent — safe to re-run (reports "already configured"). |
| **Force re-seed** | Re-run even if nothing changed. |
| **Reset** | Tear the demo down (DB records + ES index) for a clean rebuild. |
| *Include warm-up* (checkbox) | Replays the demo-script queries so Analytics, Chat Analytics, and Traces are populated immediately. |

The setup runs inside the app (the API route `POST /api/admin/setup-demo`, admin-only), so it
reuses the running server's providers, pipeline, and telemetry — no extra build step.

> Why a page and not a CLI? The seeder calls the deep service layer, which imports Next-only
> modules (`server-only`, `next-auth`) at load time. Those work inside the Next runtime but
> crash under a standalone `tsx` script — so the setup runs in-app.

## Prefer to set it up by hand?

You don't have to use the page. `data/demo.manifest.yaml` is a readable, secret-free map of
every entity the demo needs — open it and mirror each section in the Admin UI (AI Providers →
Indexes → Data Templates → Tools → Search/Chat Experiences). The two JSON files are the index
mapping and the documents to load.

## What's NOT in the YAML / manifest

| Concern | Where it lives |
|---|---|
| OpenAI API key | `.env` (`OPENAI_API_KEY`) — read by the setup route, never committed |
| Other AI provider keys / encrypted secrets | Admin UI → `Settings` (stored encrypted) |
| Runtime config (DB URLs, ports, ES URL) | `.env` |
| Admin login | `setup.config.yaml` (gitignored) |

The manifest is intentionally secret-free so it can be committed and used as the manual-setup
reference. Secrets stay in `.env` and the admin UI.
