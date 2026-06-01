---
sidebar_position: 2
---

# Search indexes

A **search index** is where your data is organised so it can be searched fast. You usually have one index per "kind" of thing — your product catalog, your articles, your support tickets, your knowledge base. An index isn't user-facing on its own — you wrap it in a [search experience](search-experiences) (or feed it to a [chat experience](chat-experiences) as a tool) to put it in front of users.

## Where to find these screens
Sidebar → **Capabilities → Search Indexes**.

## The list screen

Lands on a list of every index you've created. From here you can:

- **Filter** by type (Lexical, Semantic, Hybrid) and by status (Ready, Creating, Indexing, Error, Offline).
- **Search** by display name or technical name.
- Switch between **List** and **Grid** view.
- Click **New Index** to create one.
- Click any row to open the index detail.

The stats cards at the top show the totals — how many indexes, how many are ready, how many documents in total across all of them.

### Status badges, in plain English

| Status | What it means |
|---|---|
| **Ready** | Index is up and accepting queries. Everything's good. |
| **Creating** | The index structure is being created. Happens for a few seconds after you click Create. |
| **Indexing** | Documents are being added or re-processed. Search still works on what's already there. |
| **Error** | Something went wrong. Open the index — the detail page shows a recovery banner. |
| **Offline** | Index exists but the underlying search service can't be reached. Usually a temporary connection issue. |

### Per-row actions

Hover any row to get the three-dot menu:

- **View details** — open the detail page.
- **Edit** — go to the edit screen.
- **Reindex** — rebuild from your current field config (see [Rebuilding an index](rebuilding-an-index)).
- **Delete** — destructive; asks you to type the name to confirm.

## The three types of search

When you create an index, you pick how it searches. This **cannot be changed later** — the type is baked in.

| Type | What it does | When to use it |
|---|---|---|
| **Lexical** | Keyword matching with the usual full-text smarts (stemming, fuzzy matching, boosting). | Fast, predictable, "did the user's words appear" search. SKUs, exact lookups, glossaries. |
| **Semantic** | Vector embeddings — finds documents close in *meaning* to the query, even when the exact words don't match. | "Comfortable shoes for long flights" should match a product titled "lightweight memory-foam loafers." |
| **Hybrid** | Both. Runs lexical and semantic in parallel and blends the rankings. | Default for most product catalogs and content libraries. Catches exact matches *and* meaning-based ones. |

Semantic and hybrid indexes need an [AI provider](ai-providers) configured — the provider generates the embeddings. The embedding model and its vector size are **locked at creation**; switching later requires deleting and rebuilding because different models produce different-sized vectors.

## Creating an index

Click **New Index**. A 2- or 3-step wizard runs.

### Step 1 — Basic info

| Field | What it controls |
|---|---|
| **Display name** | Human-readable name shown across the UI. |
| **Index name** | Auto-generated technical name. Used internally and can't be changed after creation. |
| **Description** | Optional. Helps your future self remember what this index is for. |
| **Search type** | Lexical, Semantic, or Hybrid (see above). **Locked after creation.** |
| **Search provider** | Where the index physically lives. Usually **Elasticsearch** (bundled). Can be **Azure AI Search** if you've configured it. **Locked after creation.** |

### Step 2 — Search settings

| Field | What it controls |
|---|---|
| **Indexing strategy** | *On Upload* (default — documents are searchable immediately), *Scheduled* (batched), or *Manual* (only when you explicitly trigger). For most use cases, *On Upload* is right. |
| **Language** | Drives stemming and stop-word handling. Pick the language your content is in. Switching later requires a rebuild. |
| **Synonyms** | See [Synonyms and stop words](synonyms-and-stop-words). |
| **Custom stop words** | See [Synonyms and stop words](synonyms-and-stop-words). |
| **Number of replicas** *(Elasticsearch)* | How many copies of the index exist for redundancy. 0 is fine for development. Bumping it later doesn't need a rebuild. |
| **Refresh interval** *(Elasticsearch)* | How long between a document being uploaded and it being searchable. Default 1 second is fine. |

### Step 3 — AI configuration (Semantic and Hybrid only)

| Field | What it controls |
|---|---|
| **AI provider** | Which provider generates the embeddings (e.g. OpenAI, Ollama). |
| **Embedding model** | The specific model. Different models produce different vector sizes. **Locked after creation.** |
| **Vector similarity metric** | How "close" two vectors are measured. **Cosine** is the right default — works with any normalised embedding model. |

For Hybrid only, there are two extra settings:

| Field | What it controls |
|---|---|
| **RRF rank constant** | How the rankings from lexical and semantic searches get merged. The default 60 is the right starting point. |
| **RRF window size** | How many top results from each search are considered for merging. Default 1000. |

You usually don't need to touch these — the global defaults under **Settings → Search Settings** are sensible.

Click **Create Index**. You land on the detail page with an empty index. Next stop: [Index fields](index-fields).

## The detail page

This is the home page for one index. Header gives you the name, the status badge, and primary actions:

- **Upload** — go to the document upload screen.
- **Activate / Deactivate** — toggle whether the index can serve queries.
- **Export** — download the configuration as JSON.
- **Edit** — open the edit screen.

### Stats strip

Four numbers at the top:

- **Documents** — how many records are in the index right now.
- **Index size** — how much disk it's using.
- **Fields** — how many fields are mapped.
- **Search type** — Lexical / Semantic / Hybrid.

### Index Fields card
Summary of the field mappings, with a link to the full [Fields](index-fields) screen.

### Index Name card
Technical name (copy button), plus a **Reindex** button — [see Rebuilding](rebuilding-an-index).

### Index information card
Template used, created date, updated date, last indexed timestamp, internal ID.

### Search settings card
Read-only display of what you configured: indexing strategy, language, synonyms (if any), stop words (if any), provider-specific settings. Edit them on the Edit screen.

### AI configuration card *(Semantic / Hybrid only)*
The AI provider, the embedding model, and the similarity metric. Has a warning that changing AI config requires re-uploading documents.

### Error recovery banner
Only shown if the status is **Error**. Has a "Recreate Index" button that rebuilds the empty index structure from your saved field definitions, so you can re-upload your documents. Use this if the underlying search service got into a bad state.

### Danger zone
Big red **Delete** button at the bottom. Requires you to type the index name to confirm.

## The edit screen

Four tabs:

- **General** — display name, description, indexing strategy. The technical name, search type, provider, and template are shown but **locked**.
- **Text Analysis** — language, synonyms, stop words. Changing any of these shows a "**Reindexing required**" banner because the changes don't take effect for existing documents until you rebuild.
- **Provider settings** *(Elasticsearch / Azure / …)* — provider-specific knobs like replicas and refresh interval.
- **AI Config** *(Semantic / Hybrid only)* — read-only view of the current provider/model, with a **Change Configuration** button if you really need to switch. Switching deletes all indexed documents and requires you to re-upload — the dialog spells this out.

## What a document looks like

A document is just a JSON object. You don't have to define a schema in advance — Interakt auto-detects fields when you bulk-load.

```json
{
  "name": "Pacific runner sneaker",
  "brand": "Coastal",
  "category": "shoes",
  "price": 89.99,
  "in_stock": true,
  "description": "Lightweight running shoe with mesh upper..."
}
```

How those fields behave (searchable, filterable, displayed in results) is controlled in the **Fields** screen — see [Index fields](index-fields).

## Common gotchas

- **You can't change the search type after creating an index.** If you started lexical and want hybrid, delete and recreate (the embeddings have to be generated from scratch anyway).
- **You can't change the embedding provider on an existing semantic/hybrid index.** Different providers produce different vector dimensions (768 for `nomic-embed-text`, 1024 for `mxbai-embed-large`, 1536 for `text-embedding-3-small`, 3072 for `text-embedding-3-large`). Pick deliberately at creation.
- **Field type detection isn't always right.** SKUs and model numbers often get flagged as `text` when they should be `keyword`. Fix in the Fields screen.
- **Big bulk loads can fail mid-way.** Check the error in the **Recent Uploads** panel; fix the bad documents; retry.
- **Changing language, synonyms, or stop words** doesn't affect existing documents until you rebuild — see [Rebuilding an index](rebuilding-an-index).

## Where to go next

- [Index fields](index-fields) — facetable, searchable, sortable, boost, transforms — what every field setting does.
- [Synonyms and stop words](synonyms-and-stop-words) — text-analysis tuning.
- [Rebuilding an index](rebuilding-an-index) — when you need to, when you don't.
- [Loading data](../guides/bulk-load-data) — JSONL, CSV, batch sizes.
- [Search experiences](search-experiences) — how to put the index in front of users.
