# How to Integrate Interakt with Hygraph

> **Series:** Integrating Interakt with your CMS / DXP — Hygraph
> Push Hygraph content into Interakt search indexes, keep them current as editors publish, and put search and a chat assistant on the site.

This guide documents a working [Hygraph](https://hygraph.com/) project integrated with [Interakt](https://interakt.app/): a commerce-and-editorial site whose products, buying guides, journal posts, FAQs and policy pages all become searchable and chat-answerable. By the end you'll have:

1. Two Interakt indexes populated from Hygraph, with field mappings you import rather than click through.
2. A webhook that keeps them current when an editor publishes, unpublishes or deletes.
3. A search page and a floating chat assistant on the site.
4. A **button inside Hygraph Studio** that triggers a full re-feed on demand.

> **Where the code lives.** Every file path below (`src/interakt/...`, `scripts/...`) belongs to the **example site**, not to Interakt itself. The full source is public at [github.com/alphasolutionsrepo/Interakt-Hygraph](https://github.com/alphasolutionsrepo/Interakt-Hygraph) — open it alongside this guide.

---

## How the pieces fit together

```
   ┌──────────────────────┐
   │       Hygraph        │
   │   (content + CDN)    │
   └──────────┬───────────┘
              │  publish / unpublish / delete webhook
              │  + GraphQL read-back of the changed entry
              ▼
   ┌──────────────────────┐        POST /api/search-indexes/{id}/documents
   │   Your Next.js app   │ ─────  POST /api/search-indexes/{id}/documents/bulk
   │  (routes + scripts)  │        header: Authorization: Bearer ik_…
   └──────────┬───────────┘
              │                              ┌──────────────────┐
              └────────────────────────────▶ │     Interakt     │
                                             │  Search Indexes  │
   ┌──────────────────────┐                  └──────────────────┘
   │   Browser (search    │  header: X-Access-Token      ▲
   │   page + chat)       │ ─────────────────────────────┘
   └──────────────────────┘  POST /api/v1/search, /autocomplete, /summarize
                             POST /api/v1/ai-experiences/chat (SSE)
```

Hygraph owns the content. Interakt owns search and chat. Two separate credentials do two separate jobs:

- An **ingestion key** (`Authorization: Bearer ik_…`) is server-only and lets your app write documents. Ingestion endpoints send no CORS headers — they are server-to-server by design.
- **Access tokens** (`X-Access-Token`, one per experience) let the browser read from a Search Experience and an AI Experience. These are safe to ship to the client.

---

## Prerequisites

- A Hygraph project with published content, and permission to create webhooks and register apps.
- An Interakt account with admin access to create indexes and experiences.
- A Next.js app (or any Node server) that can reach Hygraph and Interakt.
- For the Studio button and the webhook: a **public HTTPS URL** for your app. During local development that means a tunnel (`ngrok http 3000`, `cloudflared`), because Hygraph's cloud has to reach you.

> API calls below use `https://admin.interakt.app`. If you self-host Interakt, swap in your own base URL.

---

## Part 1 — Decide your document shape first

This is the step people skip, and it is the one that determines whether search feels good. Everything else is plumbing.

### 1.1 One index or several?

A Search Experience can be attached to **more than one index** and will fan out and fuse results with RRF. The example uses two — `hygraph-product` and `hygraph-content` — so each corpus can have its own search type and analyzers, and so the UI can offer a "Products only" tab by passing `indexId` on the request.

There is one constraint that catches people out. A Search Experience has a **single `displayConfig`**, and exactly one field is resolved per display role for the whole experience. Splitting into two indexes does **not** let you render two different card shapes. So whether you use one index or five, every document must share the same role-bearing field names.

The example gives both indexes an identical spine:

```
uniqueId      keyword    "product:cku1…"  — namespaced, see 1.3
docType       keyword    product | guide | journal | faq | policy | author
docTypeLabel  keyword    "Product" | "Guide" | …   (facetable, drives the type filter)
title         text       role: title
description   text       role: description
body          text       the only isVectorSource field
url           url        role: link
imageUrl      image_url  role: image
tags          array      facetable
updatedAt     datetime
publishedAt   datetime
```

…and then adds per-corpus fields on top: `brand`, `price`, `inStock`, `size`, `color`, `productLine` for products; `contentType`, `author`, `readingTime` for editorial.

### 1.2 Rules the payload must obey

These are enforced by Elasticsearch or by Interakt's mapping inference, and each one fails in a way that is hard to diagnose after the fact:

- **Keep documents completely flat.** Mapping inference walks nested objects into dotted field names (`author.name`), and Elasticsearch rejects a mapping property containing a dot. Nothing sanitises it — the index simply fails to create.
- **Arrays hold primitives only.** An array of objects is typed `json` and never descended into.
- **Numbers are integers.** The `number` field type maps to Elasticsearch `integer`, so `4.2` silently truncates to `4`. Round ratings before indexing, and store money in whole units (or minor units) rather than assuming decimals survive.
- **Avoid reserved names**: `additionalData`, `customFields`, `content_embedding`, `_id`, `_indexId`, `_indexName`. `uniqueId` is yours to set.

### 1.3 Namespace your `uniqueId`

Use the Hygraph entry `id`, prefixed by type: `product:cku1…`, `guide:cku2…`.

The prefix matters for two reasons. Multi-index results are fused with RRF, which **dedupes on document id** — without namespacing, a product and a guide sharing an id collapse into one hit. And a namespaced id tells you at a glance what a document is when you're debugging an index.

The id is also the delete key when an editor unpublishes, so it must be derivable from a webhook payload without a lookup.

---

## Part 2 — Create the indexes

### 2.1 Configure an AI provider first

The embedding model is **locked at index creation**. Configure your AI provider before you create anything, or you're stuck with whatever default it picked. See [Configure an AI provider](../../../guides/configure-an-ai-provider).

### 2.2 Create the indexes

**Capabilities → Search Indexes → New**, one per corpus, type **hybrid** unless you have a reason not to. Note each **index UUID** from its admin URL — you'll need it for every ingestion call, and an ingestion key cannot tell you which index it belongs to.

See [Search indexes](../../../concepts/search-indexes) and [Creating a search index](../../../guides/create-a-search-index).

### 2.3 Import the field mapping instead of clicking through it

The Fields screen can infer a mapping from a pasted sample, but **inference reads only the first record of the array** and nothing else. A field that first appears in `sample[3]` is never created. It also decides `keyword` vs `text` on a 100-character threshold, which types `title` and `description` as unanalysed keywords — and it never sets `isVectorSource`, so nothing feeds the embedding.

Two ways to deal with that:

**Recommended — import a mapping file.** The Fields screen has an Import button that takes the same envelope its Export produces:

```jsonc
{
  "_version": 1,
  "_indexName": "hygraph-content",
  "_searchProvider": "elasticsearch",
  "fields": [
    {
      "fieldName": "uniqueId",
      "fieldType": "keyword",
      "isSystemField": true,
      "isRequired": true,
      // `reference` points uniqueId at our own value. Leave it on its default
      // (mode "default", generator "uuid") and every re-ingest mints a new id,
      // duplicating the entire corpus on the second run.
      "mapping": { "mode": "reference", "sourceField": null, "transform": "none", "sourceFromField": "uniqueId" },
      "attributes": { "isSearchable": false, "isFacetable": false, "includeInResponse": true, "boostValue": 0.1, "isVectorSource": false }
    },
    {
      "fieldName": "title",
      "fieldType": "text",
      "displayName": "Title",
      "mapping": { "mode": "source", "sourceField": "title", "transform": "none" },
      "attributes": { "isSearchable": true, "isFacetable": false, "includeInResponse": true, "boostValue": 9, "isVectorSource": false },
      "providerFieldSettings": { "isAutocomplete": true }
    },
    {
      "fieldName": "body",
      "fieldType": "text",
      "displayName": "Body",
      "mapping": { "mode": "source", "sourceField": "body", "transform": "none" },
      "attributes": { "isSearchable": true, "isFacetable": false, "includeInResponse": true, "boostValue": 3, "isVectorSource": true }
    }
    // … one entry per field
  ]
}
```

The example generates these files from its own field definitions, so the mapping and the documents can't drift: `src/interakt/mapping.ts` → `interakt/*.mapping.json`.

**Or paste a sample** — but make the **first record** carry every field. The example builds an exemplar document that takes the richest real value for each field across the corpus, precisely so `sample[0]` exercises everything and the long values type as `text` rather than `keyword`.

See [Index fields](../../../concepts/index-fields).

### 2.4 Ingestion keys

Each index gets its own key, scoped per operation: `write`, `delete`, `drop-index`. There is **no read scope** — a write-only key uploads fine and then 403s when you try to reconcile. Grant `write` **and** `delete` so stale documents can be removed.

A valid key aimed at the wrong index and a key missing an operation both return the same 403 message, so if a key looks broken, check the index UUID before regenerating it.

---

## Part 3 — Map Hygraph entries to documents

### 3.1 Rich text: select `.text`, then normalise it

Hygraph rich text is a Slate AST. Query the `text` projection rather than `raw` — indexed as a tree it serialises to `[object Object]` and the embedding is garbage:

```graphql
articleText { text }
```

One catch worth knowing: `.text` returns the **literal two-character sequence `\n`**, not real newlines. Left alone, a search snippet reads `…doing the work.\nHow the grid works`. Normalise it:

```ts
function plain(text?: string | null): string | undefined {
  if (!text) return undefined;
  return text
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
```

### 3.2 Build the document

```ts
// src/interakt/to-document.ts
export function articleToDocument(article: IndexableArticle, siteUrl: string): ContentDocument {
  const author = article.authors?.[0];

  return compact({
    uniqueId: `guide:${article.id}`,
    docType: "guide",
    docTypeLabel: "Guide",
    title: article.title,
    description: article.excerpt ?? "",
    // The description is repeated as the first paragraph of body so the
    // embedding always sees the lede.
    body: [article.excerpt, plain(article.articleText?.text)].filter(Boolean).join("\n\n"),
    url: `${siteUrl}${pathFor("article", article.slug)}`,
    imageUrl: resized(article.articleImage?.url),
    tags: article.tags,
    contentType: humaniseEnum(article.articleType),   // BUYING_GUIDE → "Buying guide"
    author: author?.name,
    readingTime: article.readingTime,
    updatedAt: article.updatedAt,
    publishedAt: article.postDate,
  });
}
```

`compact()` drops `undefined`, `null` and empty arrays — but keeps `""` and `0`. Emitting `null` for an absent field creates a mapping entry Interakt can't type and pollutes facet buckets.

Derive URLs from the **same** route helper your site's own links use. The example shares `pathFor()` between the site and the indexer, so a route change can't leave the index pointing at 404s.

### 3.3 Resize images at index time

Chat and search widgets render inside a shadow root, so you **cannot** style an oversized image with CSS from your page. Fix it in the URL instead. Hygraph transforms assets via a path segment between the environment token and the asset handle:

```
https://<region>.graphassets.com/<token>/resize=width:300/<handle>
```

In the example that took product card images from 1600×1200 / ~320 KB to 300×225 / ~12 KB.

### 3.4 Skip entries with no usable text

A document with no summary and almost no prose contributes nothing to retrieval and makes results look broken. Filter them out — and use the **same predicate** in the backfill and the webhook, or a skipped entry reappears on its next publish:

```ts
export function isIndexable(doc: { description?: string; body?: string }): boolean {
  return Boolean(doc.description?.trim()) || (doc.body?.trim().length ?? 0) >= 120;
}
```

---

## Part 4 — Backfill

### 4.1 Reading everything out of Hygraph

**Hygraph caps `first` at 100** regardless of what you ask for, so anything that must return a whole collection has to page with `skip`. A single unpaginated query silently drops everything past the first hundred:

```ts
async function fetchAllPaged<T>(build, pick): Promise<T[]> {
  const pageSize = 100;
  const out: T[] = [];
  for (let skip = 0; ; skip += pageSize) {
    const page = pick(await hygraphFetch(build(pageSize, skip)));
    out.push(...page);
    if (page.length < pageSize) return out;
  }
}
```

Read from the **CDN endpoint** for published content. If your project allows public read, the backfill needs no Hygraph token at all.

### 4.2 Pushing to Interakt

```ts
// POST {baseUrl}/api/search-indexes/{indexId}/documents
const res = await fetch(`${baseUrl}/api/search-indexes/${indexId}/documents`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ingestionKey}`,
  },
  body: JSON.stringify({ documents, sourceFileName: "hygraph-content.json" }),
});
```

Note the path has **no `/v1` segment**, and auth is `Authorization: Bearer` — `X-Api-Key` is not read at all. The middleware accepts only Bearer precisely so a public widget token can never be mistaken for an ingestion key.

Limits: **10,000 documents and 10 MB per request**, 30 uploads/min per key. Batch at 500 and honour `Retry-After` on a 429.

See [Loading data into an index](../../../guides/bulk-load-data).

### 4.3 Reconcile, carefully

After uploading, list what the index holds and delete anything Hygraph no longer has:

```ts
const live = new Set(documents.map((d) => d.uniqueId));
const stale = (await listDocumentIds(target)).filter((id) => !live.has(id));

await bulkWrite(target, stale.map((documentId) => ({ action: "delete", documentId })));
```

One guard rail worth copying: **refuse to reconcile against zero documents.** An unauthorised or misconfigured CMS read returns an empty set rather than an error, and reconciling on that empties your index.

---

## Part 5 — Keep it in sync with a webhook

### 5.1 Configure the webhook

**Project settings → Webhooks → Add**:

- **URL:** your public handler, e.g. `https://your-site.com/api/hygraph/webhook`
- **Trigger actions:** `PUBLISH`, `UNPUBLISH`, `DELETE`
- **Models:** leave empty for all models; the handler ignores what it doesn't index. A model added later then needs no webhook change.
- **Secret key:** generate one so deliveries are signed.

### 5.2 Verify the signature

Hygraph sends `gcms-signature: sign=<base64>, env=<environment>, t=<timestamp>`. The signed payload wraps the **raw** body — re-serialising a parsed body changes the bytes and the check fails:

```ts
export function verifySignature(rawBody: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(
    header.split(", ").map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)]),
  );

  const payload = JSON.stringify({
    Body: rawBody,
    EnvironmentName: parts.env,
    TimeStamp: Number(parts.t),
  });

  const expected = createHmac("sha256", secret).update(payload).digest("base64");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(parts.sign));
}
```

In a Next.js route handler, read `await request.text()` — not `request.json()` — or you lose the original bytes.

### 5.3 Decide intent from `operation`, never from the body

```ts
publish              → upsert
unpublish | delete   → remove from the index
create | update      → ignore (the index only holds published content)
```

**A delete still ships the full pre-delete entry.** Sniffing the payload for "does this look like a real document" would cheerfully re-index something that was just removed, leaving search results that 404. Route on `operation` alone.

### 5.4 Refetch the entry — the payload is not enough

Hygraph's webhook payload includes non-localized fields, but related entries arrive as bare `{ id, __typename }` and localized fields sit in a separate `localizations` array. You cannot build a useful document from it.

So on a publish, refetch that entry by id **using the same field selection the backfill uses**. That also guarantees an incrementally-updated document is byte-identical to one a full re-feed would produce, instead of the two slowly diverging.

### 5.5 Delete through the bulk endpoint

```ts
await fetch(`${baseUrl}/api/search-indexes/${indexId}/documents/bulk`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${ingestionKey}` },
  body: JSON.stringify({ operations: [{ action: "delete", documentId: uniqueId }] }),
});
```

Use `/documents/bulk`, not `DELETE /documents/:id`. The bulk `delete` is **idempotent**; the single-document delete returns 404 for an already-removed document, which turns a harmless webhook replay into a failing handler.

### 5.6 Purge your own cache first

If your site caches CMS reads, invalidate them **before** touching Interakt and unconditionally — keeping the site fresh must not depend on the search integration being healthy. Report the outcomes separately:

```ts
revalidateTag("hygraph", "max");   // Next 16 requires a cacheLife profile
// … then sync to Interakt, and return { revalidated: true } even on an Interakt failure
```

---

## Part 6 — Search and chat on the site

### 6.1 The search request

```bash
curl -X POST "https://admin.interakt.app/api/v1/search" \
  -H "Content-Type: application/json" \
  -H "X-Access-Token: YOUR_SEARCH_ACCESS_TOKEN" \
  -d '{"query":"waterproof jacket","page":1,"pageSize":12}'
```

The endpoint is `/api/v1/search` — the experience is resolved from the token, so there is no slug in the path. Things to know:

- Hits arrive as `results[].source` on this endpoint. (The slug variant, `/api/v1/search/{slug}/search`, uses `fields` instead.)
- Facet buckets use `count`, not `doc_count`.
- **The API rejects an empty query.** Use `*` to browse everything.
- Omit `facets` from the request to get auto-generated facets back.
- Pass `indexId` to scope to one index — which is how you build per-corpus tabs.

See [Calling the search API](../../../guides/call-the-search-api).

### 6.2 Two facet behaviours to design around

**Facets are recomputed with active filters applied.** Selecting "Brand: Fenn" collapses the brand facet to only Fenn, and the user is stranded with no way to switch brands without clearing. Cache the widest bucket set you've seen for the current query and render from that.

**The facet list is the union of every facetable field across all attached indexes.** That includes numeric fields bucketed one value at a time — a `reviewCount` facet with ten single numbers is noise. Keep an allow-list of facets worth showing.

When more than one index is searched, `total.relation` comes back as `gte` and counts are summed across indexes, so present it as "about N results".

### 6.3 Result cards from `displayConfig`

The search response carries the experience's `displayConfig`. Resolve each role from it, with your own field names as fallbacks:

```ts
function resolveRole(displayConfig, role: string): string | undefined {
  return [...(displayConfig?.displayFields ?? [])]
    .filter((f) => f.role === role)
    .sort((a, b) => a.order - b.order)[0]?.fieldName;
}
```

Roles are `title`, `subtitle`, `description`, `image`, `price`, `badge`, `secondary`, `link`. Remember only the lowest-order field for each role is ever used — defining two `badge` fields does not render two badges.

See [Display configuration](../../../concepts/display-configuration).

### 6.4 Drop-in widgets

The widget bundle is a vanilla IIFE served from your Interakt instance. It registers `window.SearchDropinUI` and `window.ChatDropinUI`, each with `init(config)` and `destroy(containerId)`:

```html
<div id="interakt-chat"></div>
<script src="https://admin.interakt.app/embed/v1/widgets.js"></script>
<script>
  window.ChatDropinUI.init({
    containerId: "interakt-chat",
    accessToken: "YOUR_CHAT_ACCESS_TOKEN",
  });
</script>
```

Only `containerId` and `accessToken` are required; `apiBaseUrl` defaults to the origin of the script tag. Get the exact snippet for your experience from `GET /api/v1/embed-snippet?containerId=interakt-chat` with the access token.

Mounting it from a React component has one non-obvious failure mode: **a `load` listener attached after the script has already loaded never fires**, leaving the widget hanging forever. Check for the global first, and share one load promise between widgets so the bundle is never evaluated twice. See `src/components/interakt/DropinWidget.tsx` in the example.

See [Embed widgets](../../../concepts/embed-widgets) and [Calling the chat API](../../../guides/call-the-chat-api).

### 6.5 Give the assistant tools for every index

Chat routes by letting the model choose a tool, and each tool reads **one** data source, which reads **one** index. If you split content across two indexes, create a data source and tools for **both** and attach them to the AI Experience.

Miss one and the failure is quiet but total: in the example, an assistant with only a product tool answered catalogue questions correctly and replied to *"how long do I have to return something?"* with *"could you please specify the store you are inquiring about?"* — the returns policy was indexed, in a corpus it could not reach.

See [Data sources](../../../concepts/data-sources) and [Add tools to your chat](../../../guides/add-tools-to-your-chat).

---

## Part 7 — A re-feed button inside Hygraph Studio

Editors sometimes need a full resync — after a mapping change, or if the tunnel was down when something published. The [Hygraph App Framework](https://hygraph.com/docs/app-framework) can put that button in the Content editor.

**Apps cannot run locally** — the SDK only initialises inside the Hygraph platform — so the app page must be served from a public URL.

1. Build a page that calls your own reindex endpoint (never Interakt directly — the ingestion keys must stay server-side):

```tsx
import { Wrapper, useApp } from "@hygraph/app-sdk-react";

function ReindexPage() {
  const { installation, showToast } = useApp();
  const { reindexSecret } = installation.config as { reindexSecret?: string };

  async function run() {
    const res = await fetch("/api/interakt/reindex", {
      method: "POST",
      headers: { "x-reindex-secret": reindexSecret ?? "" },
    });
    const json = await res.json();
    showToast({
      title: json.ok ? "Re-feed complete" : "Re-feed failed",
      variantColor: json.ok ? "success" : "error",
    });
  }

  return <button onClick={run}>Re-feed all content</button>;
}

export default () => <Wrapper><ReindexPage /></Wrapper>;
```

2. Register the app in **User settings → Your apps → + Add new app**. Give it a Setup URL and add a **page** element pointing at the route above. Complete every tab before saving — some fields can't be edited afterwards.

3. Protect the endpoint with a shared secret stored in the app's installation config. Anyone who can open the app is already a trusted project member; the secret stops your public URL being an open "rebuild my index" button.

4. Allow Hygraph to frame those routes, and only those:

```ts
// next.config.ts
async headers() {
  return [{
    source: "/hygraph-app/:path*",
    headers: [{
      key: "Content-Security-Policy",
      value: "frame-ancestors https://*.hygraph.com https://*.graphcms.com",
    }],
  }];
}
```

Have the button and your CLI backfill call the **same** function, so a Studio-triggered re-feed and a command-line one can't drift apart.

---

## Verify

1. **Backfill:** run it twice. The second run must leave document counts unchanged — if they double, `uniqueId` isn't mapped by `reference` and is being generated per run.
2. **Search smoke test:**
   ```bash
   curl -X POST "https://admin.interakt.app/api/v1/search" \
     -H "Content-Type: application/json" \
     -H "X-Access-Token: YOUR_SEARCH_ACCESS_TOKEN" \
     -d '{"query":"a term from your content"}'
   ```
3. **Webhook:** edit an entry in Hygraph and publish. The change should appear in search within seconds. Then unpublish it and confirm it disappears.
4. **Chat:** ask a question that can only be answered from each corpus — a product question *and* a policy question. If one fails, that corpus has no tool.
5. **Field types:** fetch a document with `GET /api/search-indexes/{id}/documents/{uniqueId}`. The response includes an `embeddingPreview` showing exactly which fields fed the vector. Note the **list** endpoint returns a truncated projection, so use the single-document endpoint when verifying.

---

## Troubleshooting

- **Ingest returns 401/403.** Check the header is `Authorization: Bearer ik_…`, not `X-Api-Key`, and the path has no `/v1`. A valid key pointed at the wrong index UUID gives the same 403 as a missing operation scope.
- **Documents double on every run.** `uniqueId` is on its default mapping (`mode: default`, `generator: uuid`), minting a new id each time. Map it by `reference` to your own value.
- **Index creation fails on a mapping property.** A field name contains a dot, almost certainly from a nested object being walked into `author.name`. Flatten the payload.
- **Body indexes as `[object Object]`.** Rich text was sent as the AST. Select `.text` and normalise the literal `\n` sequences.
- **A field is missing from the mapping.** Inference reads only `sample[0]`. Put a field-complete record first, or import a mapping file.
- **`title` matches only on exact phrases.** It was inferred as `keyword` because the sample value was under 100 characters. Set it to `text` explicitly.
- **Ratings or prices are wrong by a fraction.** `number` maps to Elasticsearch `integer`; `4.2` became `4`. Round before indexing.
- **Reconciliation 403s after a successful upload.** The ingestion key lacks `delete`. The upload already succeeded — grant the scope and re-run.
- **Facet options vanish after clicking one.** Expected: facets are recomputed with filters applied. Cache the pre-filter buckets.
- **Chat answers one topic and deflects another.** The AI Experience is missing a tool for that index.
- **Widget never appears.** The bundle loaded before your listener was attached. Check for `window.ChatDropinUI` before adding a `load` handler.

---

## What's next

- [Configure synonyms](../../../guides/configure-synonyms) — make editorial vocabulary match what customers type.
- [Add tools to your chat](../../../guides/add-tools-to-your-chat) — go beyond the auto-generated tools.
- [Guardrails](../../../concepts/guardrails) — constrain what the assistant will discuss.
- ⭐ Star Interakt on GitHub :-)
