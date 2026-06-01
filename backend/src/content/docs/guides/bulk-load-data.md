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

## Updating documents

- **Re-upload with the same `id`.** Interakt replaces the document.
- **Per-document edit** via the documents list (admin UI).

There's no partial-update — re-upload always replaces the full document.

## Deleting documents

- **Single doc** — from the documents list.
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
