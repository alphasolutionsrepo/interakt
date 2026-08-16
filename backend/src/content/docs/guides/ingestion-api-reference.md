---
sidebar_position: 12
---

# Ingestion API reference

The complete server-to-server API for getting documents into a search index and keeping them there.

This is the reference. If you are loading data for the first time, start with
[Loading data into an index](./bulk-load-data) — it covers the upload screen, file formats and
field mapping, and links back here for the details.

Everything below is **server-to-server**. These endpoints send no CORS headers, so they cannot be
called from a browser. That is deliberate: an ingestion key can write and delete, and a credential
with that power has no business in client-side code.

## Authentication

Two credentials work, and they are not interchangeable:

| Credential | Header | Used for |
| --- | --- | --- |
| **Ingestion key** | `Authorization: Bearer ik_…` | Everything on this page except key management |
| **Session cookie** | — | The admin UI, and the only way to manage keys |

```bash
curl -X POST "$BASE/api/search-indexes/$INDEX_ID/documents" \
  -H "Authorization: Bearer $INGESTION_KEY" \
  -H "Content-Type: application/json" \
  -d '{"documents": [ ... ]}'
```

A **search experience access token will not work here** and returns `401`. Access tokens are public
by design — they ship in the embed snippet — so they can only ever read. See
[Ingestion keys](../concepts/ingestion-keys) for the distinction.

**Sending an `Authorization` header disables session fallback.** If the header is present but the
key is invalid, expired or revoked, the request fails with `401`; it does not quietly fall back to
your logged-in session. This is what stops a broken deploy from appearing to work while you happen
to be signed in.

Reads (`GET`) need only a key scoped to the index. Writes need the `write` operation, deletes need
`delete`.

## Response envelope

Every response is wrapped:

```jsonc
{
  "success": true,
  "data": { /* the payload documented for each endpoint below */ }
}
```

Errors replace `data` with a message:

```jsonc
{
  "success": false,
  "error": "Document \"SKU-404\" not found",
  "code": "NOT_FOUND"
}
```

Note that a write can return `"success": true` at the envelope level with `data.success: false`
inside it — the request was handled, but some operations in it failed. See
[partial success](#partial-success-207) below.

## Rate limits

Limits are per ingestion key (falling back to client IP when there is no key), over a rolling
60-second window.

| Endpoint | Limit |
| --- | --- |
| `POST /documents` | **30 / min** |
| `PUT` `PATCH` `DELETE /documents/:documentId` | **300 / min** |
| `POST /documents/bulk` | **60 / min** |
| `POST /documents/delete-by-filter` | **20 / min** |
| All `GET` routes, and the batches routes | not limited |

Responses **from rate-limited endpoints** carry the current state. Unlimited routes send no such
headers, so do not rely on their presence:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
```

Exceeding a limit returns `429` with `Retry-After` in seconds:

```
HTTP/1.1 429
Retry-After: 42
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 0
```

**Plan for this in backfills.** The single most common mistake is looping over a large catalogue
with `POST /documents` and no pacing: at 100 documents per request, a 5,000-item catalogue is 50
requests against a 30/min limit, so it stalls a third of the way in. Either pace the loop, or
honour `Retry-After`:

```js
async function post(body) {
  for (;;) {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (res.status !== 429) return res;
    const wait = Number(res.headers.get("Retry-After") ?? 60);
    await new Promise(r => setTimeout(r, wait * 1000));
  }
}
```

If you are pushing a whole catalogue, prefer fewer, larger requests over many small ones — the cap
is on requests, not documents.

---

## Documents

All paths below are relative to `/api/search-indexes/{indexId}`.

### POST /documents — bulk upload

Loads a set of documents and tracks the work as a **batch**. This is the endpoint the upload screen
uses, and the right one for a backfill.

**Requires:** `write` · **Rate limit:** 30/min

```jsonc
{
  "documents": [
    { "id": "PROD-001", "name": "Pacific runner sneaker", "price": 89.99 }
  ],
  "sourceFileName": "catalogue-2026-08.jsonl"   // optional, shown in Recent Uploads
}
```

Limits: **10,000 documents** and **10 MB** per request. Both are configurable per deployment
(`ES_MAX_DOCUMENTS_PER_UPLOAD`, `ES_MAX_FILE_SIZE_BYTES`).

```jsonc
{
  "success": true,
  "data": {
    "success": true,
    "batchId": "9f1c…",              // use with the batches endpoints below
    "message": "Indexed 412 of 412 documents",
    "summary": { "total": 412, "indexed": 412, "failed": 0 },
    "embeddingStats": {               // semantic/hybrid indexes only
      "enabled": true, "generated": 412, "failed": 0, "skipped": 0
    },
    "errors": [],                     // up to 100
    "warnings": [],                   // up to 50
    "durationMs": 8412
  }
}
```

Unlike the incremental endpoints, this path **creates the index if it does not exist yet**, and may
recreate it if the embedding dimensions no longer match.

### GET /documents — browse

Walks the index a page at a time. Useful for checking that a mapping produced what you expected.

**Requires:** index scope only · **Not rate limited**

```bash
curl "$BASE/api/search-indexes/$INDEX_ID/documents?page=1&pageSize=25" \
  -H "Authorization: Bearer $INGESTION_KEY"
```

`pageSize` defaults to 25 and caps at 100. Paging is capped at **10,000 documents** — past that you
get `400`, because Elasticsearch refuses deep pagination and Azure has its own ceiling. To extract
an entire large index, export it rather than walking pages.

```jsonc
{
  "success": true,
  "data": {
    "documents": [
      { "id": "PROD-001", "fields": { "name": "Pacific runner sneaker", "price": 89.99 } }
    ],
    "columns": [
      { "field": "uniqueId", "label": "ID",    "type": "id" },
      { "field": "name",     "label": "Name",  "type": "text" },
      { "field": "price",    "label": "Price", "type": "number" }
    ],
    "pagination": { "page": 1, "pageSize": 25, "totalPages": 17, "totalItems": 412 }
  }
}
```

Only the `columns` fields come back per document, not the whole thing — enough to fill a table.
Fetch a single document for everything. Embedding vectors are never returned by any read.

`columns` is derived from your field configuration: the document key first, then a title if one can
be identified, then attributes ranked by how well their type fits a table cell, then `updatedAt`.
Each carries its `type` so a client can render it appropriately.

### GET /documents/:documentId — read one

**Requires:** index scope only · **Not rate limited**

The `:documentId` is the value of the index's mapped `uniqueId` field — commonly a source-system id
such as a SKU — **not** a UUID.

```jsonc
{
  "success": true,
  "data": {
    "documentId": "PROD-001",
    "document": { "name": "Pacific runner sneaker", "price": 89.99 },
    "embeddingPreview": {           // semantic/hybrid indexes only
      "text": "Product Name: Pacific runner sneaker\nCategory: Footwear",
      "totalChars": 62,
      "parts": [
        { "fieldName": "name", "label": "Product Name", "text": "Product Name: …", "included": true },
        { "fieldName": "tags", "label": "Tags", "text": "", "included": false, "excludedBecause": "empty" }
      ]
    }
  }
}
```

`embeddingPreview` is the exact text that was sent to the embedding model, with a per-field
breakdown of what contributed and what did not — the only way to see why a document does or does not
match semantically, since the stored vector is never returned.

### PUT /documents/:documentId — replace

Sends a complete document. Anything you omit is gone afterwards. Creates the document if absent.

**Requires:** `write` · **Rate limit:** 300/min

```bash
curl -X PUT "$BASE/api/search-indexes/$INDEX_ID/documents/PROD-001" \
  -H "Authorization: Bearer $INGESTION_KEY" \
  -H "Content-Type: application/json" \
  -d '{"document": {"id": "PROD-001", "name": "Pacific runner sneaker", "price": 79.99}}'
```

### PATCH /documents/:documentId — partial update

Sends a fragment. Anything you omit keeps its current value. Returns `404` if the document does not
exist.

**Requires:** `write` · **Rate limit:** 300/min

```bash
curl -X PATCH "$BASE/api/search-indexes/$INDEX_ID/documents/PROD-001" \
  -H "Authorization: Bearer $INGESTION_KEY" \
  -H "Content-Type: application/json" \
  -d '{"document": {"price": 79.99}}'
```

Both return the [write response](#write-response) shape.

### DELETE /documents/:documentId — remove one

**Requires:** `delete` · **Rate limit:** 300/min

Returns **`404` if the document is not there**. Deletes are *not* idempotent on this endpoint, which
matters for webhook handlers: a replayed delete will fail unless you tolerate `404`. If you need
idempotent deletes, use `POST /documents/bulk` with a `delete` operation instead.

### POST /documents/bulk — mixed operations

Applies many operations in one request, mixing kinds freely.

**Requires:** `write` and/or `delete`, checked per operation · **Rate limit:** 60/min

```jsonc
{
  "operations": [
    { "action": "upload", "document": { "id": "PROD-001", "name": "Sneaker", "price": 89.99 } },
    { "action": "merge",  "documentId": "PROD-002", "document": { "price": 59.0 } },
    { "action": "delete", "documentId": "PROD-003" }
  ]
}
```

- `upload` — full replace, like `PUT`. `documentId` optional; falls back to the mapped `uniqueId`.
- `merge` — partial update, like `PATCH`, but **creates the document if absent** rather than 404ing.
- `delete` — `documentId` required, no body. **Idempotent**: deleting an absent document succeeds.

Up to 10,000 operations per request. A key needs the operation each entry requires: a `write`-only
key sending a `delete` gets `403` for that entry.

<h4 id="write-response">Write response</h4>

Shared by `PUT`, `PATCH`, `DELETE` and `POST /bulk`:

```jsonc
{
  "success": true,
  "data": {
    "success": false,                 // false when any operation failed
    "message": "2 of 3 operations succeeded",
    "summary": {
      "total": 3, "succeeded": 2, "failed": 1,
      "counts": { "upload": 1, "merge": 1, "delete": 0 }
    },
    "embeddingStats": { "enabled": true, "generated": 2, "failed": 0, "skipped": 0 },
    "errors": [
      { "operationIndex": 2, "documentId": "PROD-003", "error": "Document not found" }
    ],
    "warnings": [],
    "durationMs": 214
  }
}
```

<h4 id="partial-success-207">Partial success (207)</h4>

When some operations succeed and others fail, the HTTP status is **`207 Multi-Status`**. The
envelope's `success` is still `true` — the request was processed — while `data.success` is `false`.
Check `data.summary.failed` and `data.errors`, not the status code alone.

### POST /documents/delete-by-filter — bulk delete

Deletes every document matching a set of filters, using the same filter syntax as the search API.

**Requires:** `delete` · **Rate limit:** 20/min

```jsonc
{
  "filters": [ { "field": "season", "operator": "eq", "value": "SS24" } ],
  "dryRun": true,       // default false
  "sampleSize": 25      // 0–50, dry run only
}
```

**Always dry-run first.** With `dryRun: true` nothing is deleted and you get the exact count plus a
sample of what would go:

```jsonc
{
  "success": true,
  "data": {
    "matched": 148,
    "deleted": 0,
    "sample": [ { "id": "PROD-041", "fields": { "name": "Linen shirt" } } ],
    "columns": [ { "field": "uniqueId", "label": "ID", "type": "id" } ],
    "dryRun": true,
    "message": "148 documents match this filter",
    "durationMs": 63
  }
}
```

An empty `filters` array is rejected — it would match the entire index.

---

## Batches

A `POST /documents` upload creates a batch you can poll. This is what the **Recent Uploads** panel
in the admin UI shows.

### GET /documents/batches — list recent batches

Optional `?limit=` (default 20).

```jsonc
{
  "success": true,
  "data": {
    "batches": [
      {
        "id": "9f1c…",
        "status": "completed",
        "totalDocuments": 412,
        "indexedDocuments": 412,
        "failedDocuments": 0,
        "sourceFileName": "catalogue-2026-08.jsonl",
        "createdAt": "2026-08-15T09:12:44Z",
        "completedAt": "2026-08-15T09:12:52Z",
        "durationMs": 8412
      }
    ]
  }
}
```

### GET /documents/batches/:batchId — batch progress

```jsonc
{
  "success": true,
  "data": {
    "batchId": "9f1c…",
    "status": "processing",          // pending | processing | completed | failed | cancelled
    "progress": { "total": 412, "processed": 260, "indexed": 258, "failed": 2, "percentage": 63 },
    "timing": {
      "startedAt": "2026-08-15T09:12:44Z",
      "completedAt": null,
      "durationMs": null,
      "estimatedRemainingMs": 3100
    },
    "errors": [ { "documentIndex": 17, "documentId": "PROD-018", "error": "…" } ]
  }
}
```

### DELETE /documents/batches/:batchId — cancel

Cancels an in-flight batch. **Requires:** `write`. Documents already written stay written —
cancelling stops further work, it does not roll back.

---

## Ingestion keys

Key management is **session-only**: these endpoints require a signed-in admin session and reject
ingestion keys. A key cannot mint another key, so a leaked key cannot extend its own access.

Paths are relative to `/api/search-indexes/{indexId}`.

### GET /ingestion-keys — list

Returns metadata only. The secret is never retrievable after creation.

```jsonc
{
  "success": true,
  "data": {
    "keys": [
      {
        "id": "3a2b…",
        "name": "Storyblok production",
        "keyPrefix": "ik_a1b2c3d4e5f6",   // public half, safe to display
        "operations": ["write", "delete"],
        "searchIndexIds": ["…"],
        "lastUsedAt": "2026-08-15T08:41:02Z",
        "revokedAt": null,
        "expiresAt": null,
        "createdAt": "2026-07-02T10:00:00Z",
        "isActive": true
      }
    ]
  }
}
```

### POST /ingestion-keys — create

```jsonc
{
  "name": "Storyblok production",
  "operations": ["write", "delete"],          // at least one
  "additionalSearchIndexIds": ["…"],          // optional: grant beyond the route's index
  "expiresAt": "2027-01-01T00:00:00Z"         // optional ISO date
}
```

Returns **`201`** with the plaintext key — **the only time it exists outside your own storage**:

```jsonc
{
  "success": true,
  "data": {
    "key": { "id": "3a2b…", "keyPrefix": "ik_a1b2c3d4e5f6", "…": "…" },
    "plaintextKey": "ik_a1b2c3d4e5f6_9x8w7v6u5t4s3r2q1p0o"
  }
}
```

Only a SHA-256 hash is stored. If you lose it, revoke the key and create another.

### DELETE /ingestion-keys/:keyId — revoke

Immediate and irreversible. The next request using that key gets `401`.

---

## Errors

| Status | Meaning |
| --- | --- |
| `400` | Invalid JSON body, failed validation, or paging past 10,000 documents |
| `401` | Missing, malformed, revoked or expired credential — or an access token used where a key is required |
| `403` | Valid key, but it lacks the operation or is not scoped to this index |
| `404` | Index or document not found. Also returned by `PATCH`/`DELETE` on an absent document |
| `207` | Partial success — some operations in a bulk write failed. See [partial success](#partial-success-207) |
| `409` | The index exists in Interakt but has not been provisioned in the search engine yet. Upload once via `POST /documents` to create it, then incremental writes will work |
| `429` | Rate limited. Honour `Retry-After` |

The `401` vs `403` split is deliberate: `403` confirms the key is real, so failures never reveal
which indexes exist to someone holding an unrelated key.

## See also

- [Loading data into an index](./bulk-load-data) — the task guide, file formats, field mapping
- [Ingestion keys](../concepts/ingestion-keys) — what keys are and how to manage them
- [Index fields](../concepts/index-fields) — how field configuration shapes what you can send
- [Integrating with Storyblok](../integrations/cms-dxp/storyblok/how-to-integrate-interakt-with-storyblok) — a worked end-to-end example
