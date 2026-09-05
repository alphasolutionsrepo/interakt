# How to Integrate Interakt with Medusa

> **Series:** Integrating Interakt with your e-commerce platform — Medusa
> Push a Medusa product catalog into an Interakt Search Index, then put AI-powered search and a conversational shopping assistant in front of it on a Next.js storefront.

This guide documents a working [Medusa](https://medusa.js) v2 store integrated with [Interakt](https://interakt.app/): a custom Medusa module that pushes the product catalog into an Interakt **Search Index**, kept in sync automatically as products change, plus a Next.js storefront that calls Interakt's search and chat APIs directly (no drop-in widget — a fully custom UI). By the end you'll have:

1. An Interakt Search Index populated with your Medusa catalog, kept current by subscribers on every product change.
2. A storefront search page backed by Interakt's search + autocomplete + AI summary endpoints.
3. A floating chat assistant that can converse about the catalog and take real actions — showing a product, adding it to the cart, starting checkout — via a custom action-marker protocol layered on top of Interakt's chat stream.

> **Where the code lives.** This guide is published in the Interakt docs, but every file path it references (`apps/backend/...`, `apps/storefront/...`) belongs to the **Medusa** store, not to Interakt itself. The full source is public at [github.com/alphasolutionsrepo/Interakt-Medusa](https://github.com/alphasolutionsrepo/Interakt-Medusa) — open it in another tab to see any of the files named below in context.

---

## How the pieces fit together

```
   ┌──────────────────────┐
   │    Medusa backend    │
   │    (apps/backend)    │
   └───────────┬──────────┘
               │  product.created / .updated / .deleted
               │  subscriber → workflow
               │  POST /api/search-indexes/{id}/documents, /documents/bulk
               │  header: X-Api-Key  (server-only ingestion key)
               ▼
   ┌──────────────────────┐
   │       Interakt       │
   │     Search Index     │
   └──────────────────────┘
               ▲
               │  header: x-access-token  (search token / chat token)
               │  POST /api/v1/ai-experiences/chat (SSE)
               │  POST /api/v1/search, /autocomplete, /summarize
   ┌───────────┴──────────┐
   │  Next.js storefront  │
   │  (apps/storefront)   │
   └──────────────────────┘
```

The Medusa admin also has a manual **"Push all to Interakt"** button (Part 2.3) that triggers the same push shown on top, without waiting for a product event — useful for an initial backfill or a one-off resync.

Medusa owns the product catalog. Interakt owns search and chat. Two separate credentials do two separate jobs:

- An **ingestion key** (`X-Api-Key` — Interakt calls this the per-index key, `sk_…`/`ik_…`-style) is server-only and lets the Medusa **backend** write documents into the index. This has to exist in Interakt *before* the backend can push anything.
- Two **access tokens** (`X-Access-Token`, one per experience) let the **storefront** read from a Search Experience and an AI/Chat Experience. These are safe to ship to the browser — they can only search/chat, not write.

---

## Prerequisites

- A Medusa v2 store (this guide describes `apps/backend` + `apps/storefront` exactly as scaffolded by `create-medusa-app`, with one custom module added).
- An Interakt account with admin access to create a Search Index, a Search Experience, and an AI (Chat) Experience.
- Node/Yarn set up for the Medusa monorepo (`yarn` at the repo root installs both apps).

> All Interakt API calls in this guide use the hosted base URL. If you're self-hosting Interakt, swap in your own base URL — that's exactly what `SEARCH_INDEX_URL` / `INTERAKT_API_URL` below are for.

---

## Part 1 — Set up the Interakt side first

Nothing on the Medusa side can push a single product until these exist. Do this part first.

### 1.1 Create a Search Index

In the Interakt admin console: **Capabilities → Search Indexes → New**. Pick lexical, semantic, or hybrid depending on whether you want pure keyword matching or AI-assisted matching (hybrid is the common choice for a fashion catalog with free-text queries like "warm jacket for winter"). Note the index's **ID** (a UUID) — this becomes `SEARCH_INDEX_ID` on the Medusa side.

You don't need to upload anything by hand here. Once Medusa's env vars are set (Part 2), the reindex script or the admin "Push all to Interakt" button provisions the index with real data. See [Search indexes](../../concepts/search-indexes) and [Creating a search index](../../guides/create-a-search-index).

### 1.2 Get the ingestion key

On the index's detail page, copy its **ingestion key** (`X-Api-Key`). This is the credential the Medusa **backend** authenticates with — it needs write (and ideally delete) access, since the subscribers below both create and remove documents as products change. Treat it as a secret: it only ever lives in the backend's `.env`, never in the storefront or the browser.

### 1.3 Create a Search Experience and an AI (Chat) Experience

Both point at the index from 1.1:

- A **Search Experience** (`Capabilities → Search Experiences → New`) — powers the storefront's search page. Copy its **access token**.
- An **AI Experience** (`Capabilities → AI Experiences → New`, also labeled "Chat Experience" in the UI) — powers the chat assistant. Configure its system instructions/persona here (this is also where the [action-marker instructions](#42-chat-actions-a-custom-protocol) described in Part 4 get added to the prompt). Copy its **access token**.

See [Access tokens](../../concepts/access-tokens), [Search experiences](../../concepts/search-indexes), and [Chat/AI experiences](../../concepts/chat-experiences) for what each screen configures. Data-source **tools** (search/lookup/inspect/enumerate) are auto-generated for the AI Experience from the index in 1.1 — see [Data sources](../../concepts/data-sources) and [Tools](../../concepts/tools) if you want to see what's actually happening under the hood.

---

## Part 2 — Configure Medusa

> File paths from here on (`apps/backend/...`, `apps/storefront/...`) are in the Medusa repo, not this one — see [alphasolutionsrepo/Interakt-Medusa](https://github.com/alphasolutionsrepo/Interakt-Medusa).

### 2.1 The `search-index` module

A custom Medusa module, `apps/backend/src/modules/search-index/` (`index.ts`, `service.ts`, `types.ts`; container key `searchIndex`, service class `SearchIndexClientService`), wraps every call to Interakt. It's registered like any other Medusa module in `medusa-config.ts`:

```ts
modules: [
  {
    resolve: './src/modules/search-index',
    options: {
      baseUrl: process.env.SEARCH_INDEX_URL ?? 'http://localhost:3000',
      indexId: process.env.SEARCH_INDEX_ID,
      apiKey: process.env.SEARCH_INDEX_API_KEY,
      currency: process.env.SEARCH_INDEX_CURRENCY ?? 'usd',
    },
  },
  // ...
]
```

Set these in `apps/backend/.env` (see `.env.template` for the canonical list):

| Variable | Purpose |
|---|---|
| `SEARCH_INDEX_URL` | Interakt base URL. |
| `SEARCH_INDEX_ID` | The index UUID from step 1.1. |
| `SEARCH_INDEX_API_KEY` | The ingestion key from step 1.2. |
| `SEARCH_INDEX_CURRENCY` | Currency code used when flattening variant prices (default `usd`). |

Internally, `SearchIndexClientService` sends `authorization: Bearer <apiKey>` against `${baseUrl}/api/search-indexes/${indexId}`:

- `loadDocuments()` → `POST /documents` — full (re)load; provisions the index if it's empty.
- `writeDocuments()` → `POST /documents/bulk` — incremental upload/merge/delete, batched at 1000 docs / 8MB per request.
- `readDocument()` → `GET /documents/:documentId`.

Requests retry up to 3 times on `429`/5xx, honoring `Retry-After`.

### 2.2 The document shape

Products are flattened by `toSearchDocument()` in `apps/backend/src/workflows/search-indexing/document.ts` into one Interakt document per product:

```
productId, externalId, name, shortDescription, longDescription,
brand, category, subCategory, gender, ageGroup, season, style,
material, primaryColor, careInstructions, tags[],
rating, ratingCount, hasDiscount,
primaryImageUrl, additionalImageUrls[],
createdAt, updatedAt,
variants[]  // sku, barcode, size, color, colorHex, fit, sizeSystem,
            // price, originalPrice, isDefaultVariant, stockQuantity, inStock
```

This is the schema Interakt auto-detects fields against on first upload — if you add a custom product field in Medusa that should be searchable or filterable, add it here too. See [Loading data into an index](../../guides/bulk-load-data) for how Interakt maps these fields, and [Configuring synonyms](../../guides/configure-synonyms) if you want e.g. "jumper" to match "sweater".

### 2.3 Three ways data reaches Interakt

**Reindex script** — `apps/backend/src/scripts/reindex-search.ts`, run with `yarn reindex`. Runs `reindexSearchWorkflow`, which calls `loadDocuments()` for the whole catalog. Use this for the initial backfill, or any time you've changed `toSearchDocument()` and need every product re-flattened.

**Subscribers** — fire automatically on every product change, keeping the index current without any manual step:
- `apps/backend/src/subscribers/search-index-product-changed.ts` listens for `product.created` and `product.updated`, and calls `syncSearchDocumentsWorkflow`.
- `apps/backend/src/subscribers/search-index-product-deleted.ts` listens for `product.deleted`, and calls `removeSearchDocumentsWorkflow`.

Both log and swallow errors rather than rethrow — a temporary Interakt outage fails the sync quietly instead of failing the product save. If the index and the catalog ever drift (check the doc count on the index detail page against Medusa's product count), re-run the reindex script rather than debugging individual subscriber failures.

**Admin "Push all to Interakt" button** — a widget at `apps/backend/src/admin/widgets/push-all-to-interakt.tsx` (zone `product.list`) that calls `POST /admin/search-index/reindex` (`apps/backend/src/api/admin/search-index/reindex/route.ts`), which runs the same `reindexSearchWorkflow` as the script. Useful for a one-off manual resync from inside the Medusa admin UI without shelling into the server.

---

## Part 3 — Search and search results

### 3.1 Storefront configuration

The storefront reads its own set of env vars, in `apps/storefront/src/lib/util/search-config.ts` (`.env.local` — not checked in; see that file for the required names rather than a template, since none is committed):

| Variable | Purpose |
|---|---|
| `INTERAKT_API_URL` | Interakt base URL (default `http://localhost:3000`). |
| `INTERAKT_SEARCH_TOKEN` | The Search Experience's access token from step 1.3. |
| `INTERAKT_SEARCH_TYPE` | `lexical` \| `semantic` \| `hybrid` \| `auto` (default `lexical`) — overrides the index's own default per-request. |
| `NEXT_PUBLIC_SEARCH_ENABLED` | Feature flag; `isSearchEnabled()` gates the search UI on this. |
| `INTERAKT_CHAT_TOKEN` | The AI Experience's access token — also doubles as the chat feature flag (see Part 4). |

### 3.2 The search request

`searchProducts()` (`apps/storefront/src/lib/data/search.ts`) sends `POST ${INTERAKT_API_URL}/api/v1/search` with header `x-access-token: <INTERAKT_SEARCH_TOKEN>` and body:

```json
{ "query": "...", "page": 1, "pageSize": 24, "searchType": "hybrid", "filters": [...], "sort": {...} }
```

Facets are deliberately **not** sent on the request — leaving them off gets Interakt's auto-generated facets back in the response, which the results page renders as filter chips. `autocompleteSuggestions()` calls `POST /api/v1/autocomplete` first (falling back to `/api/v1/search` if that 404s) for the search box's live suggestions.

### 3.3 AI summary

`apps/storefront/src/app/api/search-summary/route.ts` proxies a server-sent-events stream to `POST /api/v1/summarize` (same `x-access-token` header, `accept: text/event-stream`), so the results page can show a one- or two-sentence AI-written summary of what the query matched above the raw hit list, streamed in as it's generated rather than waiting for the full response.

See [Calling the search API](../../guides/call-the-search-api) for the full request/response reference, and [Creating a search experience](../../guides/create-a-search-experience) for what an access token can and can't do.

---

## Part 4 — The chat box

### 4.1 Chat request and streaming

`apps/storefront/src/app/api/chat/route.ts` proxies to `POST ${INTERAKT_API_URL}/api/v1/ai-experiences/chat` with header `x-access-token: <INTERAKT_CHAT_TOKEN>` and body `{ message, sessionId? }`, streaming the SSE response straight through. The chat panel (`apps/storefront/src/modules/chat/components/chat-panel/index.tsx`) posts to this local route (never to Interakt directly — the token stays server-side), and parses `data: {...}` frames as they arrive: `step_start`, `tool_call`, `content`, `done`, `error`. The `sessionId` returned on `done` is carried into the next request so multi-turn context (e.g. "add it to the cart" referring to a product shown two turns earlier) keeps working; the conversation is also persisted to `sessionStorage` per route so a page navigation doesn't lose it. See [Calling the chat API](../../guides/call-the-chat-api) and [Chat/AI experiences](../../concepts/chat-experiences) for the underlying contract.

The chat widget is mounted once, globally, in `apps/storefront/src/app/layout.tsx` — the root layout calls `isChatEnabled()` (true whenever `INTERAKT_CHAT_TOKEN` is set) and, if enabled, fetches `getChatWidgetConfig()` and renders `<ChatWidget>`. Mounting it in the root layout (rather than per-page) is what lets the conversation survive client-side navigation between pages.

### 4.2 Chat actions: a custom protocol

Interakt's chat API returns text and tool-call events, but has no built-in mechanism for a client-side app to receive a structured "do this in the browser" instruction (navigate somewhere, mutate the cart) — that's not part of the chat contract. This integration layers a small custom protocol on top to get that behavior:

- The AI Experience's system instructions (configured in step 1.3) tell the model to emit a fenced <code>&#96;&#96;&#96;action</code> block containing a JSON payload whenever it wants the storefront to act — e.g. showing a product page, adding an item to the cart, or starting checkout.
- `apps/storefront/src/modules/chat/lib/actions.ts` extracts these fenced blocks from the streamed text and validates the JSON against a Zod discriminated union with four variants: `navigate_product`, `navigate_search`, `add_to_cart`, `navigate_checkout`.
- `apps/storefront/src/modules/chat/lib/execute-action.ts` executes a validated action — reusing the same server actions the rest of the storefront uses (`listProducts`, `addToCart`, `retrieveCart`) rather than a separate code path.

This is entirely storefront-side convention, not an Interakt feature — if the persona's system instructions stop emitting the marker (or get edited without preserving the format), actions silently stop firing while the plain-text chat keeps working.

---

## Verify

1. **Backend push:** run `yarn reindex` from `apps/backend`, then check the index's document count on its detail page in Interakt matches your product count.
2. **Live sync:** edit a product in the Medusa admin, then use **Playground → Index Search** in Interakt to confirm the change shows up without re-running the script.
3. **Search:** load `/search` on the storefront, run a query, and confirm results, facets, and the AI summary all render.
4. **Chat:** open the floating chat, ask it to show a product, then ask it to add that product to the cart — confirm the cart actually updates and the chat correctly resolved "it" to the product shown earlier in the conversation.

---

## Troubleshooting

- **Push fails with 401/403.** `SEARCH_INDEX_API_KEY` is missing, wrong, or lacks write/delete scope — regenerate the ingestion key from the index settings (step 1.2).
- **Search returns "not configured".** `INTERAKT_SEARCH_TOKEN` (or `INTERAKT_CHAT_TOKEN` for chat) isn't set in the storefront's `.env.local`, or the token belongs to an inactive/deleted experience.
- **Products don't update after an edit.** Check the backend logs for the subscribers — they log and swallow errors rather than throwing, so a bad Interakt response fails silently. If the index has drifted, `yarn reindex` (or the admin "Push all to Interakt" button) forces a clean resync.
- **Chat replies but never acts (won't add to cart, won't navigate).** The AI Experience's system instructions have likely stopped emitting the fenced <code>&#96;&#96;&#96;action</code> block — check the persona's instructions in the Interakt admin console still contain the action-marker examples described in 4.2.
- **A field you added to Medusa isn't searchable/filterable.** It has to exist in `toSearchDocument()` (2.2) *and* be re-pushed (a subscriber only fires on the events it listens for; a schema change needs `yarn reindex` to reach existing products).

---

## What's next

- [Configure synonyms](../../guides/configure-synonyms) — e.g. make "jumper" and "sweater" match each other in your catalog.
- [Add tools to your chat](../../guides/add-tools-to-your-chat) — extend the assistant beyond the auto-generated catalog tools.
- [Elasticsearch tuning](../../guides/elasticsearch-tuning) — if you're running a large catalog and want to tune ranking.

---
