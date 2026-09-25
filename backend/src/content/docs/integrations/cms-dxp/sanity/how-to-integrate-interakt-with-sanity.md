# How to Integrate Interakt with Sanity

> **Series:** Integrating Interakt with your CMS / DXP — Sanity
> Push Sanity content into an Interakt search index, keep it current as editors publish, and put search and a chat assistant on the site.

This guide documents a working [Sanity](https://www.sanity.io/) project integrated with
[Interakt](https://interakt.app/): an outdoor travel and gear magazine whose articles, destinations
and gear reviews all become searchable and chat-answerable. By the end you'll have:

1. An Interakt index populated from Sanity, with a field mapping you import rather than click through.
2. A **GROQ-powered webhook** that keeps it current on every create, update and delete.
3. A search page and drop-in search + chat widgets on the site.
4. A reconciling backfill you can re-run whenever the two drift apart.

> **Where the code lives.** Every file path below (`src/interakt/…`, `src/sanity/…`, `scripts/…`)
> belongs to the **example site**, not to Interakt itself. The full source is public at
> [github.com/alphasolutionsrepo/Interakt-Sanity](https://github.com/alphasolutionsrepo/Interakt-Sanity)
> — open it alongside this guide.

---

## How the pieces fit together

```
   ┌──────────────────────┐
   │        Sanity        │
   │  (content + Studio)  │
   └──────────┬───────────┘
              │  GROQ-powered webhook — payload already carries
              │  the projected document, so there is no refetch
              ▼
   ┌──────────────────────┐        POST /api/search-indexes/{id}/documents
   │   Your Next.js app   │ ─────  POST /api/search-indexes/{id}/documents/bulk
   │  (routes + scripts)  │        header: Authorization: Bearer ik_…
   └──────────┬───────────┘
              │                              ┌──────────────────┐
              └────────────────────────────▶ │     Interakt     │
                                             │   Search Index   │
   ┌──────────────────────┐                  └──────────────────┘
   │  Browser (search     │  header: X-Access-Token      ▲
   │  page + widgets)     │ ─────────────────────────────┘
   └──────────────────────┘  POST /api/v1/search, /autocomplete, /summarize
```

Sanity owns the content. Interakt owns search and chat. Two separate credentials do two separate jobs:

- An **ingestion key** (`Authorization: Bearer ik_…`) is server-only and lets your app write and
  delete documents. Ingestion endpoints send no CORS headers — they are server-to-server by design.
- **Access tokens** (`X-Access-Token`, one per experience) let the browser read from a Search
  Experience and an AI Experience. These are safe to ship to the client.

**The one thing that makes Sanity different from other CMS integrations:** its webhooks are
*GROQ-powered*. You supply a projection, and Sanity evaluates it server-side and ships the shaped
document in the delivery. Storyblok and Hygraph both hand you an ID and make you fetch the entry
back; here the payload is already the document you want to index. That removes an entire round trip,
a second set of credentials in the handler, and a class of race condition where the refetch returns
a *newer* revision than the one that fired the webhook.

---

## Prerequisites

- A Sanity project with published content, and permission to create API tokens and webhooks.
- An Interakt account with admin access to create indexes and experiences.
- A Next.js app (or any Node server) that can reach Sanity and Interakt.
- For the webhook: a **public HTTPS URL**. During local development that means a tunnel
  (`ngrok http 3002`, `cloudflared`), because Sanity's cloud cannot reach `localhost`.

> API calls below use `https://admin.interakt.app`. If you self-host Interakt, swap in your own base URL.

---

## Part 1 — Decide your document shape first

This is the step people skip, and it is the one that determines whether search feels good.
Everything else is plumbing.

### 1.1 One flat shape across every document type

Sanity's document types have deliberately different fields — an `article` has `excerpt` and
`readingTime`, a `gearReview` has `verdict`, `brand` and `rating`, a `destination` has `elevation`
and `bestSeason`. Indexed as-is, each type produces its own disjoint set of facets and the search UI
has nothing common to render.

So coalesce the type-specific fields into a shared vocabulary, and let the distinguishing ones
simply be absent where they don't apply. The example's spine:

```
id            the Sanity _id            — stable, and the delete key
type          article | destination | gearReview
typeLabel     "Article" | "Destination" | "Gear review"   (facetable, drives the type filter)
title         coalesce(title, name)     role: title
slug          slug.current
url           built from type + slug    role: link
summary       coalesce(excerpt, summary, verdict)          role: description
body          Portable Text flattened to prose             the vector source
imageUrl      coalesce(mainImage.asset->url, image.asset->url)   role: image
author        author->name              (facetable)
categories    categories[]->title       (facetable)
publishedAt / updatedAt
```

…then per-type fields on top: `brand`, `gearCategory`, `rating`, `price` for gear;
`destination`, `country`, `region`, `difficulty`, `bestSeason`, `elevation` for travel.

There is one constraint that catches people out. A Search Experience has a **single
`displayConfig`**, and exactly one field is resolved per display role for the whole experience.
Even if you split content across several indexes, you do **not** get two different card shapes. So
whatever you do, every document must share the same role-bearing field names.

### 1.2 Rules the payload must obey

These are enforced by Elasticsearch or by Interakt's mapping inference, and each fails in a way that
is hard to diagnose after the fact:

- **Keep documents completely flat.** Mapping inference walks nested objects into dotted field names
  (`author.name`), and Elasticsearch rejects a mapping property containing a dot. This is exactly
  what a naive Sanity projection produces — `author->{name, role}` gives you an object. Dereference
  to a scalar instead: `"author": author->name`.
- **Arrays hold primitives only.** `categories[]->title` is fine; `categories[]->{title, slug}` is
  typed `json` and never descended into.
- **Numbers are integers.** The `number` field type maps to Elasticsearch `integer`, so a `4.2`
  rating silently truncates to `4`. Round before indexing, and store money in whole units.
- **Avoid reserved names**: `additionalData`, `customFields`, `content_embedding`, `_id`, `_indexId`,
  `_indexName`. Note `_id` in particular — send the Sanity `_id` under a plain `id` key, not `_id`.

### 1.3 Use the Sanity `_id` as the document id

```js
id: doc._id
```

Two reasons this is the right key, and both matter:

- **Re-ingesting updates rather than duplicating.** A backfill you can run twice without doubling
  the index is the difference between a safe recovery tool and one nobody dares touch.
- **It is the delete key.** When an editor deletes a document, Sanity sends the `_id` in the
  `sanity-document-id` header. No lookup is needed or possible — the document is already gone.

Sanity `_id`s are unique across the whole dataset, so unlike systems with per-model id spaces there
is no need to namespace by type.

### 1.4 Portable Text is a tree, not a string

`body` fields in Sanity are **Portable Text**: an array of block objects, not prose. Sent to Interakt
untouched, it indexes as `[object Object]` — which still produces a document *and* a vector, just a
useless one. That is the worst kind of failure: nothing errors, search just quietly gets worse.

The example uses Sanity's own `toPlainText` from `@portabletext/toolkit`:

```ts
import { toPlainText } from '@portabletext/toolkit'

const bodyText = doc.body ? toPlainText(doc.body) : ''
```

While you're there, fold in any short array fields that carry real signal. Gear reviews have `pros`
and `cons` arrays which answer questions the prose doesn't ("which one is heavy?"), so they get
appended to the indexed text rather than dropped:

```ts
const extras = [
  doc.pros?.length ? `Pros: ${doc.pros.join('. ')}.` : '',
  doc.cons?.length ? `Cons: ${doc.cons.join('. ')}.` : '',
].filter(Boolean).join(' ')

body: [doc.summary, bodyText, extras].filter(Boolean).join('\n\n').trim()
```

---

## Part 2 — Create the index

### 2.1 Configure an AI provider first

The embedding model is **locked at index creation**. Configure your AI provider before you create
anything, or you're stuck with whatever default it picked. See
[Configure an AI provider](../../../guides/configure-an-ai-provider).

### 2.2 Create the index

**Capabilities → Search Indexes → New**. Name it (e.g. `sanity-content`), type **hybrid** unless you
have a reason not to, strategy *On Upload*. Note the **index UUID** from its admin URL — you'll need
it for every ingestion call, and an ingestion key cannot tell you which index it belongs to.

See [Search indexes](../../../concepts/search-indexes) and
[Creating a search index](../../../guides/create-a-search-index).

### 2.3 Generate a field-covering mapping sample

The Fields screen can infer a mapping from a pasted sample, but **inference reads only the first
record of the array**. A field that first appears in `sample[3]` is never created. It also decides
`keyword` vs `text` on a 100-character threshold, which types `title` and `summary` as unanalysed
keywords — and it never sets `isVectorSource`, so nothing feeds the embedding.

That first point bites hard with Sanity, because the interesting fields are the sparse ones: `brand`
appears only on gear reviews, `destination` on a minority of articles. "The first twelve of each
type" is exactly the sample most likely to miss them.

The example solves this with a greedy covering set — repeatedly take the document that contributes
the most not-yet-seen fields, until every field is represented at least once:

```ts
// src/interakt/coverage.ts — the smallest subset of docs in which
// every field seen anywhere appears at least once.
export function coveringSet<T extends Record<string, unknown>>(docs: T[]): T[] {
  // …greedy: repeatedly take the document contributing the most new fields
}
```

`npm run sample` runs it against real content and writes `sample-documents.json`, reporting how many
distinct fields the chosen sample covers. Paste that file into **Configure Mappings**.

Then fix up what inference got wrong by hand:

- Set `title` and `summary` to **text**, not `keyword`.
- Set `isVectorSource` on `body` (and only `body` — it already contains the summary and extras).
- Mark `typeLabel`, `categories`, `brand`, `gearCategory`, `country`, `difficulty` and `author` as
  **facetable**.
- Boost `title`.

### 2.4 Ingestion key

On the index page, open the **Ingestion Keys** card and create one granting both **`write` and
`delete`**. Delete is not optional here — without it the webhook cannot remove unpublished documents
and the reconciling backfill will 403 halfway through.

The key is shown **once, at creation time**, and only a hash is stored. Copy it straight into your
server's environment.

See [Ingestion keys](../../../concepts/ingestion-keys).

---

## Part 3 — Write the projection once, use it twice

This is the piece that makes the Sanity integration tidy. Define the GROQ projection in one place,
and use the *same string* for the backfill query and the webhook configuration:

```ts
// src/sanity/queries.ts
export const INDEX_PROJECTION = /* groq */ `{
  _id,
  _type,
  _updatedAt,
  "title": coalesce(title, name),
  "slug": slug.current,
  "summary": coalesce(excerpt, summary, verdict),
  body,
  "imageUrl": coalesce(mainImage.asset->url, image.asset->url),
  "author": author->name,
  "categories": categories[]->title,
  "destination": destination->name,
  "country": coalesce(country, destination->country),
  "region": coalesce(region, destination->region),
  difficulty, brand, gearCategory, rating, price,
  pros, cons, bestSeason, elevation, readingTime, publishedAt
}`

/** Every publishable document, drafts excluded. Used by the backfill. */
export const ALL_INDEXABLE_QUERY = defineQuery(`
  *[_type in ["article", "destination", "gearReview"] && !(_id in path("drafts.**"))]
  | order(coalesce(publishedAt, _updatedAt) desc) ${INDEX_PROJECTION}
`)
```

Sharing it guarantees that an incrementally-updated document is byte-identical to one a full re-feed
would produce, instead of the two slowly diverging — which is the failure mode where search results
depend on *how* a document last got indexed.

The mapping from projection to Interakt document then has no CMS-specific logic left in it beyond
flattening Portable Text:

```ts
// src/interakt/toDocument.ts
export function toInteraktDocument(doc: ProjectedDocument, siteUrl: string): InteraktDocument {
  if (!doc.slug) {
    throw new Error(`Document ${doc._id} (${doc._type}) has no slug — cannot build a URL`)
  }
  return compact({
    id: doc._id,
    type: doc._type,
    typeLabel: TYPE_LABELS[doc._type] ?? doc._type,
    url: `${siteUrl.replace(/\/$/, '')}${pathFor(doc._type, doc.slug)}`,
    // …the rest of the spine from 1.1
  })
}
```

`compact()` drops keys whose value is `undefined`, `null` or an empty array, so a gear review simply
has no `country` field rather than carrying an empty one into the facets.

---

## Part 4 — Backfill

### 4.1 A Viewer token is required, not optional

This is the single biggest footgun in a Sanity integration, and it is worth its own heading.

Sanity's role-based access model returns an **empty result set** for an unauthorised read — not a
401, not an error. Even when the dataset's `aclMode` is `public`. So a backfill with a missing or
misspelled `SANITY_API_READ_TOKEN` doesn't fail; it cheerfully reports "0 documents" and looks like
an empty dataset.

```bash
npx sanity tokens add "reader" --project-id <id> --role=viewer --yes --json
```

All reads in the example are server-side, so the token never reaches the browser:

```ts
// src/sanity/client.ts
export const client = createClient({
  projectId, dataset, apiVersion,
  token: process.env.SANITY_API_READ_TOKEN,
  useCdn: false,          // the webhook drives revalidation; a CDN layer would
                          // just hold a second, independently-stale copy
  perspective: 'published',
})
```

Set `perspective: 'published'` explicitly. Without it you risk indexing draft content.

### 4.2 Pushing to Interakt

```ts
// POST {baseUrl}/api/search-indexes/{indexId}/documents
const res = await fetch(`${baseUrl}/api/search-indexes/${indexId}/documents`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ingestionKey}`,
  },
  body: JSON.stringify({ documents, sourceFileName: 'sanity-content.json' }),
})
```

Note the path has **no `/v1` segment**, and auth is `Authorization: Bearer` — `X-Api-Key` is not read
at all. The middleware accepts only Bearer precisely so a public widget token can never be mistaken
for an ingestion key.

Limits: **10,000 documents and 10 MB per request**, 30 uploads/min per key. Batch at 500 and honour
`Retry-After` on a 429.

See [Loading data into an index](../../../guides/bulk-load-data).

### 4.3 Reconcile, and refuse to reconcile against zero

After uploading, list what the index holds and delete anything Sanity no longer has:

```ts
const live = new Set(documents.map((d) => d.id))
const stale = (await listDocumentIds(target)).filter((id) => !live.has(id))

await bulkWrite(target, stale.map((documentId) => ({ action: 'delete', documentId })))
```

Reconciling matters because uploading alone can't remove anything. A document deleted while the
webhook was down would stay searchable indefinitely, and the only symptom would be a search result
leading to a 404.

But given 4.1, reconciling is also the operation most likely to destroy your index. Guard it:

```ts
if (docs.length === 0 && !allowEmpty) {
  console.error('Sanity returned no documents. Refusing to reconcile.')
  process.exit(1)
}
```

An empty result is far more often a missing token than a genuinely empty dataset. Make purging
deliberate — `npm run sync -- --allow-empty`.

---

## Part 5 — Keep it in sync with a GROQ-powered webhook

### 5.1 Configure the webhook

In [sanity.io/manage](https://www.sanity.io/manage) → your project → **API → Webhooks → Create
webhook**:

- **URL:** your public handler, e.g. `https://your-site.com/api/sanity-webhook`
- **Dataset:** `production`
- **Trigger on:** Create, Update, Delete — all three.
- **Filter:**
  ```groq
  _type in ["article", "destination", "gearReview"] && !(_id in path("drafts.**"))
  ```
- **Projection:** paste the body of `INDEX_PROJECTION` from Part 3, `{ … }` braces included.
- **Secret:** generate one (`openssl rand -hex 32`) so deliveries are signed.
- **HTTP method:** POST. **API version:** match the one your code pins.

Verify it landed with the CLI:

```bash
npx sanity hook list
```

The filter excludes drafts, so an editor saving work-in-progress doesn't fire anything. Keep the
draft check in the handler anyway (5.3) — a filter edit shouldn't silently start indexing drafts.

### 5.2 Verify the signature against the raw bytes

Sanity signs with `sanity-webhook-signature`. `next-sanity` ships a verifier that reads the raw body
itself:

```ts
import { parseBody } from 'next-sanity/webhook'

const { isValidSignature, body } = await parseBody<WebhookPayload>(req, secret)
if (!isValidSignature) {
  return Response.json({ error: 'Invalid signature' }, { status: 401 })
}
```

Do **not** parse the request to an object and re-serialise it before verifying — that produces
different bytes and fails verification every single time. `parseBody` exists to stop you doing that.

### 5.3 Decide intent from the header, never from the body

This is the one that has to be right.

**On a delete, Sanity still sends the full pre-delete document.** Same `_id`, same `slug`, same shape
as a create — because the projection is evaluated against the document as it was. Nothing in the
payload says it's gone. The only authoritative signal is the `sanity-operation` header.

Inferring the operation from the body doesn't merely *miss* the delete — it actively **re-indexes the
deleted document**, which is worse than doing nothing. The content stays searchable and every result
links to a 404.

```ts
export function resolveWebhookIntent({ operation, documentId, body }) {
  // Prefer the header id: present on every delivery including deletes,
  // and not subject to the projection resolving.
  const id = documentId ?? body?._id
  if (!id) return { kind: 'reject', reason: 'No document id in header or body' }

  if (id.startsWith('drafts.')) return { kind: 'skip', reason: 'draft' }

  if (operation === 'delete') return { kind: 'delete', documentId: id }

  // Defence in depth: an explicit tombstone, or a projection that couldn't
  // resolve a slug — which means we can't build a URL, so there is nothing
  // worth indexing.
  if (body?._deleted || !body?.slug) return { kind: 'delete', documentId: id }

  if (operation !== 'create' && operation !== 'update') {
    return { kind: 'reject', reason: `Unexpected sanity-operation: ${operation}` }
  }
  return { kind: 'upload', documentId: id }
}
```

The headers you care about:

| Header | Value |
|---|---|
| `sanity-operation` | `create` \| `update` \| `delete` |
| `sanity-document-id` | the `_id`, present even on delete |
| `sanity-project-id`, `sanity-dataset` | useful if one handler serves several projects |

Sanity has no separate "unpublish" event: unpublishing removes the published document, which arrives
as a `delete`. One code path covers both.

### 5.4 Delete through the bulk endpoint

```ts
await fetch(`${baseUrl}/api/search-indexes/${indexId}/documents/bulk`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ingestionKey}` },
  body: JSON.stringify({ operations: [{ action: 'delete', documentId }] }),
})
```

Use `/documents/bulk`, not `DELETE /documents/:id`. The bulk `delete` is **idempotent**; the
single-document delete returns 404 for an already-removed document, which turns a harmless webhook
replay into a failing handler.

### 5.5 Purge your own cache first, and unconditionally

If your site caches Sanity reads, invalidate them **before** touching Interakt, and don't make it
conditional on the search integration:

```ts
// src/interakt/webhook-handler.ts
if (intent.kind === 'reject') return { status: 400, body: { error: intent.reason } }
if (intent.kind === 'skip')   return { status: 202, body: { ok: true, skipped: intent.reason } }

deps.revalidate()          // before anything that can fail for Interakt-specific reasons

try {
  target = deps.getConfig()
} catch (err) {
  return { status: 500, body: { error: err.message, revalidated: true } }
}
```

The site reads Sanity directly. Whether its cache is stale has nothing to do with whether Interakt is
configured, reachable, or accepted the write. Revalidate first, report Interakt failures separately,
and never hold published content hostage to the search integration.

Route every site read through one helper so a single call invalidates the lot:

```ts
export const SANITY_TAG = 'sanity'

export async function sanityFetch<T>(query: string, params = {}): Promise<T> {
  return client.fetch<T>(query, params, {
    // The long window is a backstop for when the webhook can't reach this
    // host — for example when no tunnel is running locally.
    next: { tags: [SANITY_TAG], revalidate: 3600 },
  })
}
```

In Next 16, `revalidateTag(SANITY_TAG, 'max')` takes a cacheLife profile as its second argument.

### 5.6 Reference changes do not fan out

Worth knowing before it surprises you. The projection dereferences fields from documents that aren't
in the webhook filter:

```groq
"author": author->name,
"categories": categories[]->title,
"country": coalesce(country, destination->country),
```

The filter covers `article`, `destination` and `gearReview`. So renaming an author or retitling a
category changes nothing in the index — the *referencing* articles keep the stale value until the
next full sync. Editing a `destination` re-indexes that destination document, but not the articles
that inherited `country` and `region` from it.

Two ways to handle it:

- **Accept it** and run the backfill after taxonomy edits. Reasonable when references are names and
  labels that change rarely.
- **Fan out** with a second webhook on `author` and `category` whose handler re-indexes the
  referrers. The handler queries `*[references($id)] ${INDEX_PROJECTION}` and bulk-uploads the
  result. Be aware this can be a large write for a popular category, so bound it or queue it.

### 5.7 Local development needs a tunnel

Sanity's cloud can't reach `localhost`. Expose the site (`ngrok http 3002`) and point the webhook at
the tunnel URL. Next also blocks cross-origin requests to dev assets, so the tunnel host has to be
allowed — bare hostname, no scheme, no port:

```ts
// next.config.ts
const tunnelHost = process.env.NEXT_PUBLIC_TUNNEL_HOST
const nextConfig: NextConfig = {
  allowedDevOrigins: tunnelHost ? [tunnelHost, `*.${tunnelHost}`] : [],
  images: { remotePatterns: [{ protocol: 'https', hostname: 'cdn.sanity.io' }] },
}
```

The ngrok URL changes on every restart unless you have a reserved domain, so expect to update the
webhook URL — or skip the webhook locally and lean on `npm run sync`.

---

## Part 6 — Search and chat on the site

### 6.1 The search request

```bash
curl -X POST "https://admin.interakt.app/api/v1/search" \
  -H "Content-Type: application/json" \
  -H "X-Access-Token: YOUR_SEARCH_ACCESS_TOKEN" \
  -d '{"query":"waterproof shell jacket","page":1,"pageSize":12}'
```

The endpoint is `/api/v1/search` — the experience is resolved from the token, so there is no slug in
the path. Things to know:

- **Two response shapes exist.** The token-only route returns hits with a `source` object and facets
  as an **array** with `count` buckets; the slug-scoped route (`/api/v1/search/{slug}/search`) returns
  `fields` and facets keyed by field name with `doc_count`. Normalise once at the client boundary so
  the UI doesn't care which it got.
- **The API rejects an empty query.** Use `*` to browse everything.
- Omit `facets` from the request to get auto-generated facets back.
- Omit `pageSize` unless you mean to override the experience's configured default.

See [Calling the search API](../../../guides/call-the-search-api).

### 6.2 Two facet behaviours to design around

**Facets are recomputed with active filters applied.** Selecting "Type: Gear review" collapses the
type facet to only that value, and the user is stranded with no way to switch without clearing.
Cache the widest bucket set you've seen for the current query and render from that.

**The facet list is the union of every facetable field.** Numeric fields get bucketed one value at a
time — an `elevation` facet with thirty single numbers is noise. Keep an allow-list of facets worth
showing, with human labels:

```ts
const FACET_LABELS: Record<string, string> = {
  typeLabel: 'Type', categories: 'Category', brand: 'Brand',
  gearCategory: 'Gear', country: 'Country', difficulty: 'Difficulty', author: 'Author',
}
const visible = facets.filter((f) => FACET_LABELS[f.field])
```

### 6.3 Result cards from `displayConfig`

The search response carries the experience's `displayConfig`. Resolve each role from it, with your
own field names as fallbacks, so changing what a result shows is an admin-side change rather than a
code change:

```ts
function pickByRole(hit: SearchHit, display: DisplayConfig | undefined, role: string) {
  const field = display?.displayFields?.find((f) => f.role === role)?.fieldName
  return field ? hit.fields[field] : undefined
}

const title = pickByRole(hit, display, 'title')  ?? String(hit.fields.title ?? hit.id)
const url   = pickByRole(hit, display, 'link')   ?? (hit.fields.url as string)
const badge = pickByRole(hit, display, 'badge')  ?? (hit.fields.typeLabel as string)
```

Roles are `title`, `subtitle`, `description`, `image`, `price`, `badge`, `secondary`, `link`. Only the
lowest-order field for each role is ever used — defining two `badge` fields does not render two badges.

See [Display configuration](../../../concepts/display-configuration).

### 6.4 Streamed AI summaries

`POST /api/v1/summarize` takes results you already have and streams a summary over SSE. Because it's
POST-and-SSE, `EventSource` (GET-only) cannot be used — read the response body yourself.

One trap worth copying the fix for: parse each frame **outside** the try that handles partial frames.

```ts
let event: Record<string, unknown>
try {
  event = JSON.parse(payload)
} catch {
  continue                    // a partial frame — wait for the rest
}

if (event.type === 'error') {
  throw new Error(String(event.error ?? 'Interakt summary stream failed'))
}
```

If the `throw` sits inside the same `try`, the partial-frame handler swallows it and a
server-reported error becomes an apparently successful empty summary.

### 6.5 Drop-in widgets

The widget bundle is a vanilla IIFE served from your Interakt instance. It registers
`window.SearchDropinUI` and `window.ChatDropinUI`, each with `init(config)` and
`destroy(containerId)`:

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

Only `containerId` and `accessToken` are required; `apiBaseUrl` defaults to the origin of the script
tag. Get the exact snippet for your experience from
`GET /api/v1/embed-snippet?containerId=interakt-chat` with the access token.

Mounting from React has one non-obvious failure mode: **a `load` listener attached after the script
has already loaded never fires**, leaving the widget hanging forever. Check for the global first,
and share one load promise between widgets so the bundle is never evaluated twice:

```ts
function bundleReady(globalName: 'SearchDropinUI' | 'ChatDropinUI'): boolean {
  return typeof window !== 'undefined' && Boolean(window[globalName])
}
```

Don't cache a rejected load promise either — a transient network failure would otherwise disable both
widgets until a full page reload. See `src/components/interakt/DropinWidget.tsx` in the example.

Add your site's origin to the **allowed origins** on both experiences, or every browser call comes
back 403.

See [Embed widgets](../../../concepts/embed-widgets) and
[Calling the chat API](../../../guides/call-the-chat-api).

---

## Verify

1. **Backfill twice.** The second run must leave document counts unchanged. If they double, you're
   not keying on the Sanity `_id`.
2. **Search smoke test:**
   ```bash
   curl -X POST "https://admin.interakt.app/api/v1/search" \
     -H "Content-Type: application/json" \
     -H "X-Access-Token: YOUR_SEARCH_ACCESS_TOKEN" \
     -d '{"query":"a term from your content"}'
   ```
3. **Webhook — update.** Edit a document in Studio and publish. The change should appear in search
   within seconds. Sanity's webhook screen shows delivery attempts and responses.
4. **Webhook — delete.** Delete a document and confirm it *disappears*. This is the test that catches
   an intent resolver reading the body instead of the header: a broken one leaves the document
   indexed and searchable, pointing at a 404.
5. **Draft isolation.** Save a draft without publishing. Nothing should be delivered, and nothing
   should change in the index.
6. **Field types.** Fetch a document with `GET /api/search-indexes/{id}/documents/{id}`. The response
   includes an `embeddingPreview` showing exactly which fields fed the vector — confirm your flattened
   `body` is there and is prose, not `[object Object]`. The **list** endpoint returns a truncated
   projection, so use the single-document endpoint for this.

---

## Troubleshooting

- **Backfill says "0 documents" and the dataset isn't empty.** Missing or wrong
  `SANITY_API_READ_TOKEN`. Sanity returns an empty result set for an unauthorised read, not an error.
  Create a Viewer token.
- **The sync deleted everything.** Same cause as above, plus a reconcile with no zero-document guard.
  Add the guard, then re-run the backfill to restore.
- **Ingest returns 401/403.** Check the header is `Authorization: Bearer ik_…`, not `X-Api-Key`, and
  the path has no `/v1`. A valid key pointed at the wrong index UUID gives the same 403 as a missing
  operation scope.
- **Reconciliation 403s after a successful upload.** The ingestion key lacks `delete`. The upload
  already succeeded — grant the scope and re-run.
- **Signature verification fails on every delivery.** You parsed the body before verifying. Use
  `parseBody` from `next-sanity/webhook`, which reads the raw bytes itself.
- **Deleted documents stay searchable.** The handler is inferring intent from the payload. Sanity
  sends the full pre-delete document on a delete — route on the `sanity-operation` header.
- **`body` indexes as `[object Object]`.** Portable Text was sent as the AST. Run it through
  `toPlainText` from `@portabletext/toolkit`.
- **Index creation fails on a mapping property.** A field name contains a dot, almost certainly from
  a projection returning an object (`author->{name}`). Dereference to a scalar.
- **A field is missing from the mapping.** Inference reads only `sample[0]`. Generate a
  field-covering sample, or import a mapping file.
- **`title` matches only on exact phrases.** It was inferred as `keyword` because the sample value
  was under 100 characters. Set it to `text` explicitly.
- **Ratings are wrong by a fraction.** `number` maps to Elasticsearch `integer`; `4.2` became `4`.
  Round before indexing.
- **An author rename didn't update articles.** Expected — see [5.6](#56-reference-changes-do-not-fan-out).
- **Widgets return 403 from the browser.** Your origin isn't on the experience's allowed origins list.
- **Widget never appears.** The bundle loaded before your listener was attached. Check for
  `window.ChatDropinUI` before adding a `load` handler.
- **Webhook works in production but not locally.** Sanity's cloud can't reach `localhost`. Run a
  tunnel and set `allowedDevOrigins` to its bare hostname.

---

## Notes on the Interakt API

The shipped backend differs from some published integration material. This guide targets what the
code actually serves:

| | Sometimes documented as | Actual |
|---|---|---|
| Ingest path | `/api/v1/search-indexes/{id}/documents` | `/api/search-indexes/{id}/documents` |
| Ingest auth | `X-Api-Key` | `Authorization: Bearer ik_…` |
| Search path | `/api/v1/search-experiences/{slug}/search` | `POST /api/v1/search` |
| Widgets | `<script data-token data-container>` | `window.SearchDropinUI.init({…})` |

---

## What's next

- [Configure synonyms](../../../guides/configure-synonyms) — make editorial vocabulary match what
  readers type.
- [Add tools to your chat](../../../guides/add-tools-to-your-chat) — go beyond the auto-generated tools.
- [Guardrails](../../../concepts/guardrails) — constrain what the assistant will discuss.
- ⭐ Star Interakt on GitHub :-)
