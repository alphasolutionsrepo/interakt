---
sidebar_position: 6
---

# Data sources

A **data source** is the connection to where data physically lives. Most people interact with data sources only in the background — they're the plumbing behind search indexes and tools. But there are screens for them, and you'll need them if you're connecting Interakt to something external.

## Where to find these screens
Sidebar → **Capabilities → Data Sources**.

## What a data source is, conceptually

Think of it as "the cable between Interakt and a body of data." The data source records:

- What kind of source this is (an Interakt index, an external index, a file store, a database).
- Where it lives (a URL, a credential, a path).
- What operations are available on it (search, lookup, inspect, enumerate).
- How its fields are shaped.

The four built-in **tools** for each data source — search, lookup, inspect, enumerate — are auto-generated from this metadata. That's the chain: **data source → tools → AI experience uses the tools**.

## The four kinds of data sources

### Search index (internal)
The most common kind. A data source that points at one of *your own* Interakt search indexes. When you upload data into an Interakt index, a matching data source is created automatically.

Configuration:
- **Index ID** — which Interakt search index this wraps.
- **Operation** — which tool operations are exposed (usually all four).
- **Max results** — default limit.
- **Response fields** — which fields are returned by the tools.
- **Include highlights** — whether to highlight matching terms.

You don't usually edit these by hand — the tool generator does it for you. But you can override behaviour here if the auto-generated tools aren't quite right.

### External search index
Points at a search engine that's *not* hosted by Interakt — your existing Elasticsearch cluster or an Azure AI Search service.

Configuration:
- **Provider** — Elasticsearch or Azure AI Search.
- **Connection** — URL, index name, auth type and credentials.
- **Search defaults** — search type (lexical / vector / hybrid), max results.

Use this when you already have a search backbone and you don't want to copy data into Interakt. Interakt acts as the orchestration layer; the data and the search engine stay where they are.

### File store
A bucket or folder of files (markdown, PDFs, plain text). Interakt extracts the text, chunks it, embeds it, and stores the chunks in its own knowledge base.

Configuration:
- **Chunking strategy** — paragraph, fixed-size, semantic.
- **Chunk size / overlap** — controls how documents get split for embedding.
- **Embedding provider / model** — which AI model embeds the text.
- **Max file size** and **max total storage** — guards against runaway uploads.
- **Allowed file types** — md, txt, pdf, docx.
- **Extract metadata** — keep file properties (author, date) on the chunks.
- **Extract tables** — try to keep tabular structure when extracting from PDFs.

Use this for documentation, knowledge bases, support articles — content that exists as files, not records. The in-app Help Assistant is built on a file store of these very docs.

### Database
Points at a SQL or NoSQL database. Interakt runs queries against it on demand.

Configuration:
- **Connection** — connection string with credentials (typically referenced from the [Secrets vault](secrets)).
- **Query template** — the SQL or query language used by the tool.

This is for read-only access to a system of record. Useful when you want a chatbot to be able to look up live data (e.g. "what's the status of order #1234") instead of relying on a stale copy.

## The list screen

The usual table-or-cards listing, with:

- **Stats cards** — total, active, healthy, total documents across all sources.
- **Filters** — by type and by status.
- **Search** — by name or slug.

Each row shows the health status — green check if the source can be reached, red alert if not. Click the health value on the detail page to re-check.

## The detail page

The header has the name, type badge, and an **Activate / Deactivate** toggle plus an **Edit** button.

### Stats strip
Four numbers: health, status, document count, storage used.

### Configuration card
Type-specific — what you configured at creation. For external sources, this shows the provider, URL, index name, and auth type (the credentials themselves are stored as secrets and not shown).

### Metadata card
Slug, type, created, updated, last health check, health message.

### Field schema card
What fields exist on this data source, with their types and roles. Comes from inspecting the source — Interakt auto-discovers the schema for search indexes and for file stores (after a sample is ingested).

### Tools card
Lists the tools that exist for this data source. The **Create Tools** button auto-generates the standard set (search, inspect, enumerate, lookup) for any operations that don't yet have a tool. Skipped operations show a reason.

### Danger zone
**Delete** button. Disabled if any tools or experiences depend on this data source — you have to remove the dependents first.

## Creating a data source

### From scratch
Click **New Data Source** on the list page. A wizard runs:

1. Pick the **type** (Search Index, External Index, File Store, Database).
2. Fill in **basic info** — name, slug, description.
3. Fill in **type-specific configuration** (see the four kinds above).
4. Click **Create**.

Then click **Create Tools** on the detail page to generate the four standard tools.

### Automatically
When you upload data into an Interakt search index for the first time, a matching internal data source is created behind the scenes. You don't have to do anything — go to the Data Sources list and you'll see it there.

The Initial Setup demo creates a file-store data source for the docs Help Assistant.

## Editing a data source

Two cards in the edit screen:

- **Basic information** — name, description.
- **Configuration** — type-specific config.

You **cannot change the type** of a data source after creation. If you need to switch from a file store to a search index, create a new data source.

## Common gotchas

- **The Health check is a real check.** If a data source goes unhealthy, the tools using it will fail. Click into the source and use the re-check button to confirm the issue is real, then fix it at the source (e.g. credentials, network).
- **Internal data sources are tied to their search index.** Deleting the search index removes the data source and its tools. Don't delete an index that has tools wired into a live experience.
- **File stores re-embed when you change the embedding model.** It's not automatic — you have to re-ingest the files.
- **Database tools need careful query design.** A bad query template can lock up the DB or leak data. Treat database tools as production code; review them.

## Where to go next

- [Tools](tools) — what gets generated from data sources, and how to write custom ones.
- [Search indexes](search-indexes) — the most common kind of data source.
- [Secrets](secrets) — how to reference credentials in data source configurations.
