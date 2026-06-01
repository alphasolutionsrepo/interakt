---
sidebar_position: 1
---

# Create a search index

This is the step-by-step for creating an index, configuring its fields, and loading data. About 10 minutes.

## Before you start

- You're logged in as an admin or moderator.
- If you want **semantic** or **hybrid** search, you have an [AI provider configured](configure-an-ai-provider).
- You have some data in JSON, JSONL, CSV, or Excel format. If you don't, the [Initial Setup demo](../getting-started/initial-setup) gives you a ready-made Fashion Catalog.

## 1. Open the create wizard

Sidebar → **Capabilities → Search Indexes** → **New Index**.

## 2. Fill in basic info

| Field | What to put |
|---|---|
| **Display name** | Human-readable. "Product Catalog", "Help Articles". |
| **Index name** | Auto-generated from the display name. Lowercase + hyphens. **Can't be changed later.** |
| **Description** | Optional. *"Main product index used by the storefront search."* |
| **Search type** | Pick **Hybrid** unless you have a specific reason. See [Search indexes → The three types of search](../concepts/search-indexes). **Can't be changed later.** |
| **Search provider** | **Elasticsearch** (default). Pick **Azure AI Search** only if you've configured that. **Can't be changed later.** |

Click **Next**.

## 3. Search settings

| Field | What to put |
|---|---|
| **Indexing strategy** | **On Upload** for most cases. Documents become searchable as you upload them. |
| **Language** | The primary language of your content. Drives stemming and stop-words. |
| **Synonyms** | Skip for now — see [Synonyms and stop words](../concepts/synonyms-and-stop-words) once you've seen the index in action. |
| **Custom stop words** | Skip for now. |
| **Number of replicas** (ES) | 0 is fine for dev. |
| **Refresh interval** (ES) | Default 1 second is fine. |

Click **Next**.

## 4. AI configuration *(Semantic / Hybrid only)*

| Field | What to put |
|---|---|
| **AI provider** | Defaults to your system default. Override if needed. |
| **Embedding model** | Defaults to your provider's default. **Can't be changed later.** |
| **Vector similarity metric** | **Cosine** (default). Don't change without a reason. |

(For Hybrid only) **RRF rank constant** and **window size** — leave at defaults. They tune how lexical and semantic results blend, and the global defaults under [Settings → Search](../concepts/settings) are usually right.

Click **Create Index**.

## 5. Configure fields

You land on the index detail page with no fields and no data. Click **Configure Mappings** (or **Fields** in the header).

1. Paste a sample of your data (10 records is enough) in the **Source Data** panel on the right.
2. Interakt detects the fields and proposes types. A dialog asks you to confirm — review the list.
3. Click **Create Fields**.

The fields appear in the table. For each one, click the gear icon to open the configuration sidebar:

- **Searchable** — turn on for fields users search by words (title, description, brand).
- **Facetable** — turn on for fields users filter by (category, brand, colour, size, status).
- **Sortable** — turn on for fields you'll let users sort by (price, date, rating).
- **Include in response** — usually yes; off for internal-only fields.
- **Boost value** — leave at 1 except for the 1–2 most important fields (title often gets 2).

For full coverage of each switch, see [Index fields](../concepts/index-fields).

Click **Save Mappings** in the floating save bar at the bottom.

## 6. Upload data

Click **Upload** in the index detail page header.

- Drag your file into the drop zone or click to browse.
- Leave **batch size** at 1000.
- Click **Upload**.

A progress bar shows. For OpenAI, expect ~30 seconds per 1000 documents. Ollama is several times slower.

The index status badge turns green ("Ready") and the document count updates when it's done.

## 7. Verify

Sidebar → **Playground → Index Search**. Pick your index. Try a few queries:

- A literal term from your data — should be the top result.
- A vaguer phrase that doesn't appear word-for-word — with hybrid, semantic matches should fill the gaps.
- Apply a filter on a facetable field — confirm filtering works.

If the results look right, you're ready to wrap this index in a [search experience](create-a-search-experience).

## Troubleshooting

**Upload failed: "could not generate embeddings."**
Your AI provider isn't reachable. Check Platform → AI Providers → Test Connection. If Ollama: confirm `ollama serve` is running and the embedding model is pulled.

**Some documents failed to upload.**
The Recent Uploads panel on the upload page shows which batch failed and why — usually a single malformed record. Fix it and re-upload that batch.

**Field types look wrong after upload.**
Edit the field on the Fields page. Some changes need a [rebuild](../concepts/rebuilding-an-index) to apply to existing documents.

**"Index name already exists."**
Names are unique system-wide. Delete the existing one or pick a different name.

## Where to go next

- [Create a search experience](create-a-search-experience) — wrap the index in a public API.
- [Bulk load data](bulk-load-data) — formats, field detection, troubleshooting.
- [Configure synonyms](configure-synonyms) — improve recall for everyday terminology.
- [Rebuild an index](../concepts/rebuilding-an-index) — when changes don't take effect.
