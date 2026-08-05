---
sidebar_position: 2
---

# Loading data into an index

Once an index exists, you need to put data in it. This guide covers the upload screen, the supported formats, what to check before uploading, and what to do when something goes wrong.

## Where to find the upload screen
Sidebar → **Capabilities → Search Indexes** → open your index → **Upload** button in the header.

## Supported formats

| Format | When to use | Notes |
|---|---|---|
| **JSONL** (JSON Lines) | Recommended for big files. | One JSON object per line. Streaming-friendly. |
| **JSON Array** | Small or hand-built loads. | `[{"id": ...}, {"id": ...}]`. Loaded fully into memory. |
| **CSV** | Spreadsheet exports. | First row is headers. Auto-detects basic types. |
| **Excel (.xlsx)** | When CSV is awkward. | First sheet used. First row is headers. |

For anything over a few thousand documents, prefer **JSONL** — it streams without loading the whole file. The file extension matters; rename `.json` containing line-delimited JSON to `.jsonl`.

## What a document looks like

```json
{
  "id": "PROD-001",
  "name": "Pacific runner sneaker",
  "brand": "Coastal",
  "category": "shoes",
  "price": 89.99,
  "in_stock": true,
  "tags": ["running", "casual"],
  "description": "Lightweight running shoe with mesh upper..."
}
```

Rules of thumb:

- **`id` (or `uniqueId`) is recommended.** Without one, Interakt generates one. With one, re-uploading the same doc replaces it instead of duplicating.
- **Fields can be nested**, but Interakt won't search inside them unless you flatten or use a **computed** field mapping. See [Index fields → Computed mode](../concepts/index-fields#section-1--value--source).
- **Keep documents under 1 MB each.** Big descriptions are fine; entire PDFs are not — extract text first and upload through a [file-store data source](../concepts/data-sources) instead.

## Doing the upload

1. Open the index → **Upload**.
2. Drag your file into the drop zone, or click to browse.
3. Pick a **batch size**. 1000 is usually right. Smaller batches show progress sooner but take longer; larger batches are slightly faster but show less feedback.
4. (Optional) Expand additional settings:
   - **Retry failed documents** — auto-retry transient failures.
   - **Skip duplicates** — if an `id` already exists, leave the existing doc alone.
   - **Overwrite existing** — replace any doc with a matching id.
5. Click **Upload**.

A progress bar appears with:
- Current document count / total.
- Speed (docs/sec).
- Estimated time remaining.

For 1000 documents on OpenAI: ~30 seconds. On Ollama on a laptop: a few minutes (each document gets embedded individually for hybrid/semantic indexes). Large catalogs (50k+ records) run in the background — close the page and come back.

## What you'll see in Recent Uploads

The Recent Uploads panel on the right shows the last 5 batches with their status:

- **Pending** — queued.
- **Processing** — in progress (with a progress bar).
- **Completed** — done. Shows total / failed counts.
- **Failed** — the whole batch failed (rare). Shows the error.
- **Cancelled** — you cancelled mid-upload.

Click any row to see per-document errors if there were any.

## Validating the upload

1. Index status badge should show **Ready**.
2. Document count on the index detail page should reflect the new total.
3. Sidebar → **Playground → Index Search** → pick the index → search for a literal term from your data.

If the count looks right and a sample query returns hits, you're good.

## Field mapping considerations

When uploading for the first time, the **Fields** screen on the index lets you paste sample JSON and have Interakt detect fields. Common things to verify before the bulk load:

- **SKUs and IDs detected as numbers.** Should usually be `keyword` for exact-match facets.
- **Short categorical text as `text`.** Brands, categories, statuses are usually better as `keyword`.
- **Numeric ranges** (price, weight, rating) need `number` for range filters and sorting.
- **Boolean fields** — confirm filterable is on if you want to filter by them.

See [Index fields](../concepts/index-fields) for what each switch does.

## When auto-detection isn't enough

Auto-detection only sees what's literally in the sample document. Cases it can't handle:

| Need | What to do |
|---|---|
| **Computed** field from a nested array (e.g. `availableColors` = unique values from `variants[].color`) | Configure the field manually with mapping mode = **Computed**, source path = `variants`, extract field = `color`, aggregation = `unique`. |
| **Static** field constant across all docs (`currency: "USD"`) | Configure manually with mapping mode = **Static**. |
| **Reference** field aliasing another (`uniqueId` ← `productId`) | Configure with mapping mode = **Reference**. |
| **Generated** unique IDs when source has none | Configure with mapping mode = **Generated** (UUID / timestamp / sequence). |
| **Boost values** — domain-specific ranking | Adjust in field config sidebar. Defaults are flat. |

For complex mappings, the JSON view of the Fields screen is faster than clicking through gear icons one by one. Export the current mapping, edit, re-import.

## Incremental updates

Re-uploading the whole dataset to change one document is wasteful once a catalog gets large. Individual documents can be added, updated, and deleted over the API without touching the rest of the index.

All paths below are relative to `/api/search-indexes/:id`, where `:id` is the search index UUID.

### Authentication

Every document endpoint accepts either:

- **Your logged-in session** — what the admin UI uses. Nothing to configure.
- **An [ingestion key](../concepts/ingestion-keys)** — for an external system, sent as `Authorization: Bearer <key>`. Create one on the index's **Ingestion Keys** card; keys are scoped to specific indexes and to `write` / `delete`.

```bash
curl -X POST "$INTERAKT_URL/api/search-indexes/$INDEX_ID/documents" \
  -H "Authorization: Bearer $INTERAKT_INGESTION_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"documents": [ ... ]}'
```

A **search experience access token will not work here** and returns `401`. Access tokens are public by design — they ship inside the embed snippet — so they are read-only. Writes need a secret credential. See [Ingestion keys](../concepts/ingestion-keys) for the full comparison.

Unauthenticated requests are rejected on every one of these endpoints.

### Addressing a document

The `:documentId` in these routes is the value of the index's mapped **`uniqueId`** field — usually a source-system identifier such as a SKU, not a UUID. It's the same value that decides whether a re-upload replaces or duplicates a document.

If your index generates `uniqueId` values (mapping mode = **Generated**), incremental updates are awkward: you have to read the generated id back before you can address the document. Map `uniqueId` from a stable source field instead.

### The operations

| Method | Path | What it does |
|---|---|---|
| `GET` | `/documents` | Page through the documents in the index. |
| `GET` | `/documents/:documentId` | Fetch a document as stored in the index. |
| `PUT` | `/documents/:documentId` | **Replace** the document in full. Creates it if absent. |
| `PATCH` | `/documents/:documentId` | **Partially update** it. Omitted fields keep their stored values. `404` if the document doesn't exist. |
| `DELETE` | `/documents/:documentId` | Remove it. `404` if it doesn't exist. |
| `POST` | `/documents/bulk` | Apply a mixed batch of the three write actions. |
| `POST` | `/documents/delete-by-filter` | Delete everything matching a filter. |

The index must already exist. These routes never create or rebuild it — that's deliberate, because rebuilding an index to satisfy a single-document write would discard everything else in it. If the index hasn't been provisioned yet you get a `409` telling you to run a full upload first. Use `POST /documents` (the bulk load above) for that.

They do, however, work on a **deactivated** index — deactivating one to clean it up is exactly when you need them. This is why they don't go through the search API, which refuses inactive indexes.

### Browsing the index

`GET /documents` walks the index a page at a time. Use it to see what's actually stored — handy for checking that a field mapping produced what you expected.

```bash
curl "/api/search-indexes/$INDEX/documents?page=1&pageSize=25"
```

```jsonc
{
  "success": true,
  "data": {
    "documents": [
      { "id": "PROD-001", "fields": { "name": "Pacific runner sneaker", "price": 89.99 } }
    ],
    // A compact set of columns picked from your field config, ID first
    "columns": [
      { "field": "uniqueId", "label": "ID" },
      { "field": "name", "label": "Name" }
    ],
    "pagination": { "page": 1, "pageSize": 25, "totalPages": 17, "totalItems": 412 }
  }
}
```

`pageSize` defaults to 25 and caps at 100. Each document's `id` is the value you pass to the single-document routes above.

Two things to know:

- **Paging is capped at 10,000 documents.** Past that you get a `400` — Elasticsearch refuses deep pagination and Azure has its own ceiling. To extract an entire large index, use a full export rather than walking pages.
- **Ordering.** On Elasticsearch documents come back sorted by `uniqueId`, so paging is repeatable. On Azure AI Search the key field is not sortable, so order is provider-defined and rows can in principle shift between pages.

Only a few fields come back per document, not the whole thing — enough to fill a table. Fetch a single document by id for everything. Embedding vectors are never returned by any of these reads; a vector is thousands of floats and useless to look at.

### Replace vs. partial update

`PUT` sends a complete document; whatever you omit is gone afterwards. `PATCH` sends a fragment; whatever you omit is left alone.

```bash
# Replace: the document ends up with exactly these fields
curl -X PUT /api/search-indexes/$INDEX/documents/PROD-001 \
  -H 'Content-Type: application/json' \
  -d '{"document": {"id": "PROD-001", "name": "Pacific runner sneaker", "price": 79.99}}'

# Partial update: only the price changes, everything else survives
curl -X PATCH /api/search-indexes/$INDEX/documents/PROD-001 \
  -H 'Content-Type: application/json' \
  -d '{"document": {"price": 79.99}}'
```

A `PATCH` also leaves `createdAt` alone and refreshes `updatedAt`. A `PUT` regenerates both, because it is a full replace — if you need the original creation time preserved, send it in the body.

This behaves identically on Elasticsearch and Azure AI Search. (Before incremental updates existed, a full upload replaced documents on Elasticsearch but merged them on Azure. Both now replace.)

### Bulk mixed operations

For syncing a batch of changes from a source system, one request carries all three actions:

```bash
curl -X POST /api/search-indexes/$INDEX/documents/bulk \
  -H 'Content-Type: application/json' \
  -d '{
    "operations": [
      { "action": "upload", "document": { "id": "PROD-002", "name": "Trail runner", "price": 119.00 } },
      { "action": "merge",  "documentId": "PROD-001", "document": { "price": 79.99 } },
      { "action": "delete", "documentId": "PROD-003" }
    ]
  }'
```

Operations are independent. A failure in one is reported against its own position and doesn't stop the others, so the response is `207 Multi-Status` when some succeeded and some didn't:

```json
{
  "success": false,
  "summary": {
    "total": 3,
    "succeeded": 2,
    "failed": 1,
    "counts": { "upload": 1, "merge": 1, "delete": 0 }
  },
  "errors": [
    { "operationIndex": 2, "documentId": "PROD-003", "error": "..." }
  ]
}
```

Same limits as a full upload: at most 10,000 operations and 10 MB per request.

Unlike a full upload, incremental writes are **not** recorded in Recent Uploads — they return their results inline instead of creating a batch record.

Note the difference in how a missing document is treated: `delete` inside a bulk batch succeeds if the document was already gone (so a retried sync is safe), while `DELETE /documents/:documentId` returns `404` (because you named one specific document).

### Embeddings on incremental writes

For **semantic** and **hybrid** indexes, the vector has to stay in step with the text it was built from:

- **`upload` / `PUT`** — the vector is always regenerated, since the whole document was replaced.
- **`merge` / `PATCH`** — the vector is regenerated only if your payload touches a field marked as a **vector source**. When it does, Interakt reads the stored document first and builds the embedding from the merged result, so the vector describes the whole document rather than just the fragment you sent. When it doesn't, the stored vector is left untouched and no embedding call is made.

So patching a `price` on a hybrid index costs no embedding tokens; patching a `description` does.

If embedding generation fails, that operation fails rather than writing a document with a stale or missing vector — a document without one is invisible to semantic search.

### Deleting by filter

To purge a whole slice of the index — a discontinued category, a retired supplier — filter instead of enumerating ids. Filters use the same syntax as the [search API](call-the-search-api), so you can try a filter in search first to see what it selects.

```bash
# Preview: what exactly would this remove?
curl -X POST /api/search-indexes/$INDEX/documents/delete-by-filter \
  -H 'Content-Type: application/json' \
  -d '{"filters": [{"field": "status", "operator": "eq", "value": "discontinued"}], "dryRun": true}'
```

A dry run answers both *how many* and *which*:

```jsonc
{
  "matched": 412,
  "deleted": 0,
  "dryRun": true,
  // First 25 of the matches, so you can check the filter caught the right things
  "sample": [
    { "id": "PROD-003", "fields": { "name": "Court classic", "status": "discontinued" } },
    { "id": "PROD-014", "fields": { "name": "Ridge sandal",  "status": "discontinued" } }
  ],
  "columns": [
    { "field": "uniqueId", "label": "ID" },
    { "field": "name", "label": "Name" }
  ]
}
```

```bash
# Then actually delete
curl -X POST /api/search-indexes/$INDEX/documents/delete-by-filter \
  -H 'Content-Type: application/json' \
  -d '{"filters": [{"field": "status", "operator": "eq", "value": "discontinued"}]}'
# → { "matched": 412, "deleted": 412, "dryRun": false, "sample": [] }
```

Always run it with `dryRun: true` first and read the sample. There is no undo — restoring deleted documents means re-uploading them.

**The sample is a sample.** It caps at 25 by default (`sampleSize`, max 50; set `0` to skip the extra lookup). The delete applies to all `matched` documents, not just the ones listed. `matched` itself is always an exact count, not an estimate.

At least one filter clause is required; an empty filter is rejected rather than interpreted as "everything". Only **indexed** fields can be filtered on.

It's a `POST` rather than a `DELETE` because request bodies on `DELETE` are unreliable through proxies and some HTTP clients.

## Managing documents from the admin UI

Sidebar → **Capabilities → Search Indexes** → open your index → **Documents** button in the header.

From there you can:

- **Browse the index** page by page. Click any row to expand it into the full stored document, with a Delete button behind a confirmation. This is the quickest way to sanity-check a load — if a field mapping went wrong, you'll see it here.
- **Look up a document** by its id, when you already know which one you want.
- **Delete by filter**, with a required preview step: pick a field, condition, and value, hit **Preview matches**, and you get both the count and a table of the first matches. The delete button only unlocks once you've previewed — and it deletes *all* matches, not just the rows shown.

Adding and updating individual documents is API-only — the UI covers browsing, inspection, and deletion.

## Deleting documents

- **Single doc** — the **Documents** screen on the index, or `DELETE /documents/:documentId`.
- **Many docs by condition** — the Delete-by-filter section of that screen, or `POST /documents/delete-by-filter`.
- **All docs (keep index)** — currently requires Reindex with empty data, or recreate-index from the error recovery.
- **Whole index** — Delete button on the index detail page. No recovery.

## Common gotchas

- **Inconsistent field types between docs.** First doc has `price: 89.99` (number); second has `price: "89.99"` (string). The second fails to index. Normalise types before uploading.
- **Fields appear in some docs but not others.** Fine — they're optional. But if the first sample doc you pasted doesn't have a `description` field, it won't be in the schema. Move a doc that has every field to the top of your sample.
- **Nested objects you wanted searchable.** Flatten or use Computed. `{ author: { name: "Jane" } }` won't be searched on `author.name`; either flatten to `author_name` or set up a computed field.
- **Datetime strings in non-ISO format.** Interakt expects ISO 8601. `"2024-03-15"` works; `"March 15, 2024"` doesn't.
- **Uploading replaces but doesn't trigger field-config changes.** If you uploaded with the wrong field types, fixing the types and re-uploading the same data isn't enough — you also need a [rebuild](../concepts/rebuilding-an-index).
- **Big uploads on Ollama.** Each document gets embedded one at a time. 10,000 docs on a laptop with a local model can take an hour. Switch to OpenAI for big initial loads.

## Where to go next

- [Index fields](../concepts/index-fields) — verifying your fields look right before big uploads.
- [Rebuilding an index](../concepts/rebuilding-an-index) — when changes need to apply to existing data.
- [Create a search experience](create-a-search-experience) — putting the loaded index in front of users.
