# How to Integrate Interakt with Storyblok

> **Series:** Integrating Interakt with your CMS / DXP — Storyblok
> Add AI-powered search and chat to a Storyblok-powered site, kept automatically in sync as editors publish content.

This guide walks through connecting [Storyblok](https://www.storyblok.com/) (a headless CMS) to [Interakt](https://interakt.app/) so that your published content becomes searchable and chat-answerable — with no manual re-indexing. By the end you'll have:

1. An Interakt index populated with your Storyblok content (one-time backfill).
2. A webhook that keeps that index in sync whenever an editor publishes, unpublishes, or deletes a story.
3. A search widget and an AI chat widget live on your site via Interakt's drop-in script.

---

## How the pieces fit together

Storyblok owns the content. Interakt owns search and chat. The job of the integration is to move content from one to the other and keep it fresh.

```
                   (1) one-time backfill
   ┌──────────────┐  GET /v2/cdn/stories         ┌──────────────────┐
   │              │ ─────────────────────────>   │                  │
   │  Storyblok   │                              │   Your ingest    │
   │   (content)  │                              │   script / fn    │
   │              │ <────────────────────────    │                  │
   └──────────────┘  (2) story.published         └──────────────────┘
          │              webhook                     │
          │                                          │ POST /api/search-indexes/{id}/documents
          │                                          ▼
          │                                 ┌──────────────────┐
          │                                 │     Interakt     │
          │                                 │   Search Index   │
          │                                 └──────────────────┘
          │                                          │
          │              (3) drop-in widgets         │
          ▼                                          ▼
   ┌─────────────────────────────────────────────────────────┐
   │   Your Storyblok-powered website (search + chat widgets)│
   └─────────────────────────────────────────────────────────┘
```

The key design point: **Storyblok's webhook payload is intentionally lightweight** — it tells you *which* story changed (its ID and slug) but not the content itself. So on every event you fetch the full story from Storyblok's Content Delivery API, transform it, and push it to Interakt.

---

## Prerequisites

- A Storyblok space with some published content and **admin or owner** access (only owners/admins can configure webhooks).
- A Storyblok **Content Delivery API token** (Settings → Access Tokens — the public `published` token is fine).
- An Interakt account with:
  - A **Search Index** (you'll create one below).
  - An **ingestion key** scoped to that index, sent as `Authorization: Bearer`.
  - A **Search Experience** and/or **AI (Chat) Experience** with an **access token** for the widgets.
- A place to run a small webhook handler reachable over HTTPS (a serverless function on Vercel/Netlify/Cloudflare Workers, or any small Node service).

> All Interakt API calls in this guide use the hosted base URL `https://admin.interakt.app`. If you're self-hosting Interakt, swap in your own base URL.

---

## Part 1 — Set up the Interakt side

### 1.1 Create a Search Index

In the Interakt admin console, create a new **Search Index** for your Storyblok content (e.g. `storyblok-content`). Note its **index ID** (a UUID) — you'll need it for ingestion.

### 1.2 Create an ingestion key

Writing documents uses an **ingestion key**, which is a different credential from the access tokens your widgets use. On the index page, open the **Ingestion Keys** card and create one, granting it the `write` operation (add `delete` too if you plan to remove documents — see [Handling unpublish & delete](#handling-unpublish--delete)).

The key is shown **once, at creation time**, and only a hash of it is stored — so copy it straight into your server's environment. If you lose it, revoke that key and create another.

Treat it like a password: it grants write access to your index, so it belongs only on your server, never in browser code. Keys are scoped to the indexes and operations you grant them, and can be revoked individually without disturbing anything else.

### 1.3 Create your experiences

- A **Search Experience** powers the search widget and returns the access token the search widget uses.
- An **AI Experience** powers the chat widget and returns the access token the chat widget uses.

Point both at the index from step 1.1. Copy each experience's **access token** (`X-Access-Token`) — these are safe to expose in the browser.

---

## Part 2 — Get Storyblok content into Interakt

### 2.1 Flatten Storyblok content into searchable documents

Storyblok stories are nested JSON, and rich-text fields are a document tree rather than plain strings. For good search and chat results you want clean, flat text. This dependency-free helper walks a Storyblok rich-text field and returns plain text:

```js
// richtext.js
// Flattens a Storyblok rich-text field ({ type: "doc", content: [...] })
// into a single plain-text string.
export function richTextToPlainText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(richTextToPlainText).join(" ");

  let text = node.text ? node.text : "";
  if (node.content) {
    text += " " + richTextToPlainText(node.content);
  }
  return text.replace(/\s+/g, " ").trim();
}
```

Next, map a Storyblok story to an Interakt document. The Interakt ingestion API accepts **arbitrary fields**, so shape the document to match what you want to search and display. Adjust the field names to your own content model:

```js
// map.js
import { richTextToPlainText } from "./richtext.js";

const SITE_URL = "https://your-site.com";

// `story` is a Storyblok story object from the Content Delivery API.
export function storyToDocument(story) {
  const c = story.content || {};

  return {
    // Use the Storyblok UUID as the stable document id so re-ingesting
    // the same story updates it rather than creating a duplicate.
    id: story.uuid,

    title: c.title || story.name,
    slug: story.full_slug,
    url: `${SITE_URL}/${story.full_slug}`,

    // Map your own fields here:
    excerpt: c.intro || "",
    body: richTextToPlainText(c.body),     // rich-text field → plain text
    tags: story.tag_list || [],
    component: c.component,                 // e.g. "blog_post", "page"

    published_at: story.published_at,
  };
}
```

> **Use your own field names.** `title`, `intro` and `body` above are placeholders for whatever
> your Storyblok content type actually defines. Check a story in the Content Delivery API and map
> the fields you have.

### 2.2 One-time backfill

Run this once to populate the index with everything already published. It pages through the Content Delivery API and pushes documents to Interakt in batches.

```js
// backfill.js  (Node 18+, run with: node backfill.js)
import { storyToDocument } from "./map.js";

const SB_TOKEN     = process.env.STORYBLOK_PUBLIC_TOKEN;
const INDEX_ID     = process.env.INTERAKT_INDEX_ID;
const INGEST_KEY   = process.env.INTERAKT_INGEST_KEY;
const INTERAKT_URL = "https://admin.interakt.app";

async function fetchAllStories() {
  const stories = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = new URL("https://api.storyblok.com/v2/cdn/stories");
    url.searchParams.set("token", SB_TOKEN);
    url.searchParams.set("version", "published");
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    // Optional: limit to a folder, e.g. only blog posts:
    // url.searchParams.set("starts_with", "blog/");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Storyblok ${res.status}: ${await res.text()}`);

    const { stories: batch } = await res.json();
    if (!batch.length) break;

    stories.push(...batch);
    const total = Number(res.headers.get("total") || 0);
    if (stories.length >= total) break;
    page++;
  }
  return stories;
}

async function ingest(documents) {
  const res = await fetch(
    `${INTERAKT_URL}/api/search-indexes/${INDEX_ID}/documents`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${INGEST_KEY}`,
      },
      body: JSON.stringify({ documents }),
    }
  );
  // 30 requests/minute on this endpoint. A large space will hit that, so honour
  // Retry-After rather than failing the backfill two thirds of the way through.
  if (res.status === 429) {
    const wait = Number(res.headers.get("Retry-After") ?? 60);
    console.log(`Rate limited, waiting ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return ingest(documents);
  }
  if (!res.ok) throw new Error(`Interakt ${res.status}: ${await res.text()}`);
  // { success: true, data: { batchId, summary: { total, indexed, failed }, ... } }
  return res.json();
}

async function main() {
  const stories = await fetchAllStories();
  console.log(`Fetched ${stories.length} stories from Storyblok`);

  const documents = stories.map(storyToDocument);

  // Ingest in batches. Larger batches mean fewer requests, and the rate limit
  // counts requests rather than documents — 500 is comfortably inside the 10,000
  // document and 10 MB per-request caps for typical stories.
  const BATCH = 500;
  let indexed = 0, failed = 0;
  for (let i = 0; i < documents.length; i += BATCH) {
    const result = await ingest(documents.slice(i, i + BATCH));
    indexed += result.data?.summary?.indexed ?? 0;
    failed  += result.data?.summary?.failed  ?? 0;
  }
  console.log(`Done. indexed=${indexed} failed=${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

### 2.3 Keep it in sync with a webhook

Now wire up the live updates. The flow:

```
Editor clicks Publish in Storyblok
        │
        ▼
Storyblok fires "story.published" webhook  ──▶  Your handler
                                                   │
                                                   ├─ verify signature
                                                   ├─ fetch full story (CDN API)
                                                   ├─ map → Interakt document
                                                   └─ POST to ingestion API
```

**Configure the webhook in Storyblok** (Settings → Webhooks → **+ New Webhook**):

- **Endpoint:** the public HTTPS URL of your handler.
- **Events:** `Story → published`, and optionally `unpublished` and `deleted`.
- **Secret:** generate a strong one (`openssl rand -hex 20`) so you can verify requests.

> Storyblok webhooks **do not retry on failure**, and they time out after 120 seconds. Respond quickly — ideally acknowledge with `202 Accepted` and do the ingest work asynchronously if it might be slow.

**The handler** (shown as a generic Node serverless function; adapt the export to your platform):

```js
// api/storyblok-webhook.js
import crypto from "node:crypto";
import { storyToDocument } from "../map.js";

const SB_TOKEN     = process.env.STORYBLOK_PUBLIC_TOKEN;
const SB_SECRET    = process.env.STORYBLOK_WEBHOOK_SECRET;
const INDEX_ID     = process.env.INTERAKT_INDEX_ID;
const INGEST_KEY   = process.env.INTERAKT_INGEST_KEY;
const INTERAKT_URL = "https://admin.interakt.app";

function verifySignature(rawBody, signature) {
  if (!SB_SECRET) return true; // no secret configured
  // NOTE: Storyblok sends the signature in the `webhook-signature` header.
  const expected = crypto
    // Storyblok signs webhooks with SHA-1. Confirm against their current webhook
    // documentation before relying on this — a mismatch rejects every delivery.
    .createHmac("sha1", SB_SECRET)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ""));
}

async function fetchStory(fullSlug) {
  const url = new URL(`https://api.storyblok.com/v2/cdn/stories/${fullSlug}`);
  url.searchParams.set("token", SB_TOKEN);
  url.searchParams.set("version", "published");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Storyblok ${res.status}`);
  const { story } = await res.json();
  return story;
}

async function ingest(documents) {
  return fetch(`${INTERAKT_URL}/api/search-indexes/${INDEX_ID}/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${INGEST_KEY}`,
    },
    body: JSON.stringify({ documents }),
  });
}

export default async function handler(req, res) {
  const rawBody = await readRawBody(req); // platform-specific; see note below
  const signature = req.headers["webhook-signature"];

  if (!verifySignature(rawBody, signature)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const payload = JSON.parse(rawBody);
  // Storyblok story payload looks like:
  // { text, action: "published", space_id, story_id, full_slug }
  const { action, full_slug } = payload;

  try {
    if (action === "published") {
      const story = await fetchStory(full_slug);
      await ingest([storyToDocument(story)]);
    } else if (action === "unpublished" || action === "deleted") {
      // Delete by the same id you indexed with — see below.
      await removeDocument(payload.story_id_uuid);
    }
    return res.status(202).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Ingest failed" });
  }
}
```

> **Raw body matters for signature verification.** Verify the HMAC against the *exact* raw request body, not a re-serialized object. On Vercel/Netlify you may need to disable automatic body parsing for this route so you can read the raw bytes.

#### Handling unpublish & delete

When an editor unpublishes or deletes a story, remove the matching document. Interakt has a delete endpoint that takes the document id, so the mapping stays simple — the Storyblok `uuid` you used as the document id is the same id you delete by.

The ingestion key needs the `delete` operation for this; if you only granted `write` in step 1.2, add it (or create a second key) before wiring this up.

Use the **bulk** endpoint rather than `DELETE /documents/:id`. Webhooks get replayed, and a bulk
`delete` succeeds whether or not the document is still there, whereas the single-document `DELETE`
returns `404` for one that has already gone — which would turn a harmless retry into a failing
handler.

```js
// A bulk delete is idempotent: removing a document that isn't there still
// reports success, so a replayed webhook is harmless.
async function removeDocument(documentId) {
  const res = await fetch(
    `${INTERAKT_URL}/api/search-indexes/${INDEX_ID}/documents/bulk`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${INGEST_KEY}`,
      },
      body: JSON.stringify({
        operations: [{ action: "delete", documentId }],
      }),
    }
  );
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
  return res.json();
}

// In the webhook handler, for story.unpublished / story.deleted:
await removeDocument(payload.story_id_uuid);
```

The id you delete by must be the id you indexed with — the story's `uuid`, set in `storyToDocument()`. Note that a deleted story can no longer be fetched from the Content Delivery API, so the uuid has to come from the webhook payload itself.

> **Check which field carries the UUID.** Storyblok's webhook payload includes `story_id`, which is
> the *numeric* id — not the `uuid` used as the document id here. Log a real delete webhook once and
> confirm which field you need before wiring this up; deleting by the wrong id silently removes
> nothing.


**If you'd rather keep the content and hide it**, the alternative is a status field — add `status: "published"` in `storyToDocument()`, write `status: "unpublished"` on those events, and configure the Search Experience to only return documents where `status = "published"`. That preserves history at the cost of carrying unpublished content in the index. Prefer a real delete unless you specifically need that.

---

## Part 3 — Add the search and chat widgets

This is the easy part. Interakt ships a **drop-in script**: a `<script>` tag plus a container element. The same approach works for both the search widget and the chat widget — each is driven by its experience's access token.

You can grab the exact snippet two ways:

**A) From the admin console** — open your experience's **Embed** section and copy the ready-to-paste snippet.

**B) From the API** — call the embed-snippet endpoint with the experience's access token:

```bash
curl "https://admin.interakt.app/api/v1/embed-snippet?containerId=interakt-search" \
  -H "X-Access-Token: YOUR_SEARCH_ACCESS_TOKEN"
```

The response includes the ready-to-use `html`, the `scriptUrl`, the `containerId`, and the applied config (theme, primary color, launcher style, placement).

The snippet you paste into your page looks roughly like this:

```html
<!-- Search widget -->
<div id="interakt-search"></div>
<script
  src="https://admin.interakt.app/<!-- widget script path -->"
  data-interakt-token="YOUR_SEARCH_ACCESS_TOKEN"
  data-container="interakt-search"
  async
></script>
```

> **Copy the snippet from your own install.** The markup above is illustrative — script URL and
> `data-*` attribute names come from your deployment. Use the snippet shown in the experience's
> **Embed** section, or returned by the embed-snippet endpoint above, rather than retyping this one.

### Where to put it in a Storyblok-powered site

Storyblok renders through your own front end, so place the snippet wherever you control the page shell:

- **Next.js / Nuxt / Astro / SvelteKit:** add it to your root layout or `app.html`/`_document` so it loads on every page. Use the framework's script component (`next/script`, `<svelte:head>`, Astro's `is:inline`) so it isn't stripped during hydration.
- **A specific page only:** drop it into the template for that route, or expose a Storyblok component (e.g. an `interakt_search` bloks) that editors can place visually in the Visual Editor.

Because the widgets only need the public **access token** (not the ingestion key), it's safe to ship them to the browser.

---

## Verify the integration

1. **Backfill:** run `backfill.js` and confirm the console reports `indexed > 0, failed = 0`.
2. **Search API smoke test:**
   ```bash
   curl -X POST "https://admin.interakt.app/api/v1/search" \
     -H "Content-Type: application/json" \
     -H "X-Access-Token: YOUR_SEARCH_ACCESS_TOKEN" \
     -d '{"query":"a term from your content","searchType":"auto"}'
   ```
   You should get ranked results back.
3. **Webhook:** publish a story in Storyblok, then check your handler logs and re-run the search for a term from that story. New content should appear without a manual backfill.
4. **Widgets:** load your site, open the search and chat widgets, and confirm they return your Storyblok content.

---

## Troubleshooting

- **Webhook fires but nothing indexes.** Check the handler is returning a 2xx with `content-type: application/json`. Inspect Storyblok's **Webhook Logs** (in webhook settings) for the delivered payload and response. Tools like webhook.site help you see the raw payload.
- **Signature check fails.** Make sure you're hashing the **raw** request body, not a re-serialized object, and confirm the algorithm matches Storyblok's signature tutorial.
- **Rich text shows up as `[object Object]` or empty.** Your field is a rich-text tree, not a string — run it through `richTextToPlainText()`.
- **Duplicate documents.** Make sure you're using a stable `id` (the Storyblok `uuid`) so re-ingesting updates rather than inserts.

---

## What's next

That's a complete, self-updating pipeline: editors publish in Storyblok, and search + chat stay current automatically. 

- ⭐ Star Interakt on GitHub :-)

---