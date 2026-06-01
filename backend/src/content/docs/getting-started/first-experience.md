---
sidebar_position: 4
---

# Your first experience

End-to-end walkthrough with **your own data**. Roughly 15 minutes once you have an AI provider configured. By the end you'll have:

- A search index loaded with your data.
- A search experience your users could open in a browser.
- (Optional) A chat experience that can answer questions about that data.

If you haven't connected an AI provider yet, do that first — see [Initial setup](initial-setup).

> **Want to see it working with sample data first?** The Initial Setup screen has a one-click "Set up demo" that does all of the steps below using a bundled Fashion Catalog. Run that, click around, then come back here when you're ready to use your own data.

## What you'll need

- A **chunk of data** to search — a JSON file is easiest. A product catalog, a list of articles, a knowledge-base export, anything where each "thing" has a name and a few attributes.
- About 15 minutes.

The data should be a JSON array of objects, one per record:

```json
[
  { "id": "001", "title": "Product A", "category": "shoes", "price": 99.99 },
  { "id": "002", "title": "Product B", "category": "shirts", "price": 49.99 }
]
```

If your data is in a spreadsheet, export it to CSV — Interakt accepts CSV too. PDFs and Word documents go through **Data Sources → File Store** instead, which is a different path covered in [Data sources](../concepts/data-sources).

## Step 1 — Create a search index

Sidebar → **Capabilities → Search Indexes** → **New Index**.

Fill in:

- **Display name** — something readable, e.g. *"Product catalog"*.
- **Search type** — pick **Hybrid** unless you have a specific reason. Hybrid combines keyword matching ("did the user's words appear?") with meaning-based matching ("is the result *about* what the user asked?"). It's the right default for most catalogs and content.
- **Search provider** — leave on **Elasticsearch** unless you're connecting to Azure AI Search.

Click **Next**.

On the **Search settings** step:

- **Indexing strategy** — *On Upload* is fine. Documents become searchable as soon as you upload them.
- **Language** — pick the primary language of your content. This controls how text is broken into searchable tokens and which words are ignored as "stop words" (the, and, a…).
- Skip synonyms and stop words for now — you can add them after you see how search behaves.

Click **Next**.

On the **AI configuration** step (only shown for Hybrid and Semantic types):

- **AI provider** — pick the one you set up in Initial Setup.
- **Embedding model** — the default for your provider is fine.

Click **Create Index**. You land on the index's detail page.

> **Heads up — embedding model is locked.** Once the index exists, you can't change which embedding model created it. If you want to switch, you delete and re-upload. Pick deliberately.

## Step 2 — Define the fields

Click **Configure Mappings** on the detail page (or click **Fields** in the sidebar of the index detail).

You'll see a panel where you can paste your sample data and Interakt will guess the field shape from it.

1. Paste the first ~10 records of your JSON in the **Source Data** panel on the right.
2. Interakt detects the fields and proposes types (`title` → text, `price` → number, `category` → keyword, etc.).
3. Review the proposal. The common things to adjust:
   - SKUs and model numbers that look like text but should be **keyword** (so they match exactly, not by partial words).
   - Numeric fields you want to **filter** or **sort** by.
   - Image URLs you want returned in results but not searched.

For each field, the right column has a gear icon — click it to open a sidebar where you set:

- **Searchable** — does keyword search look at this field's content? Turn on for things like *title*, *description*. Turn off for IDs and prices.
- **Facetable** — can your users filter results by this field's values? Turn on for *category*, *brand*, *colour*, *size* — anything you'd want a filter chip for.
- **Include in Response** — is the field returned in search results? Usually yes.
- **Boost value** — how much extra weight matches in this field get for ranking. Title fields are often boosted to ~2; description left at 1.

If your data needs more advanced wiring (a price that comes from a nested `variants[]` array, a static `currency: "USD"` on every record, a generated ID), see [Index fields](../concepts/index-fields). For most data you can leave the defaults.

Click **Save Mappings** at the bottom.

## Step 3 — Upload your data

Click **Upload** in the index detail page header (or **Data sources** if you're connecting an external system).

- **Drag the file** into the drop zone, or click to browse. Accepts JSONL (one JSON object per line — recommended for big files), JSON arrays, CSV, or Excel.
- Leave the **batch size** at 1000.
- Click **Upload**.

You see a live progress bar. For 1000 documents on OpenAI, expect ~30 seconds. On Ollama / local Llama, expect a few minutes (each document gets embedded individually). Big catalogs (50k+ records): start the upload and come back later — it runs in the background and you can watch progress in the **Recent Uploads** panel on the right.

When it's done, the index status badge turns green ("Ready") and the document count updates.

## Step 4 — Try it in the Playground before making it public

Sidebar → **Playground → Index Search**.

Pick your index from the dropdown and start typing queries. This is the same search engine your users will hit; it just bypasses access tokens because you're logged in as admin. Try:

- An exact term from your data — should be the top result.
- A vague phrase that doesn't appear verbatim — *"cold weather clothes"* if your data has jackets and coats. With hybrid, you should get good matches.
- Add a filter — pick a facetable field (category, brand) and a value. The results narrow down.

If the results look wrong: check the field mappings (some fields aren't searchable when they should be), or come back later and [add synonyms](../guides/configure-synonyms).

## Step 5 — Build a search experience

The index isn't reachable from outside the admin yet. A **search experience** is what wraps it with an access token, sets the public URL slug, and decides how results are displayed.

Sidebar → **Experiences** → **New Experience** → **Search Experience**.

Fill in:

- **Name** — *"Product search"*.
- **Slug** — auto-generates as you type. This is the URL path your users hit.
- **Index** — pick the one you just created. Role: **Primary**.

Click **Next**. The remaining steps are optional for now:

- **Search settings** — pagination, autocomplete. Defaults are fine.
- **AI configuration** — leave off for now. You can come back and turn on AI summaries once you've seen the basic search working.
- **Display configuration** — this is what your users see in the result cards. Map your fields to roles: *title*, *subtitle*, *image*, *price*, *badge*, *link*. If you skip this, Interakt shows all fields generically — fine for testing, ugly for real use.

Click **Create**. You land on the experience detail page.

## Step 6 — Embed it (or copy the API URL)

On the experience detail page, expand the **Search Widget** card.

- Adjust theme, colours, and layout. Watch the preview update.
- Pick **Modal** (a button that opens a search overlay) or **Inline** (embedded in a specific page section).
- Click **Copy** to copy the embed snippet — a single `<script>` tag plus a `<div>`.
- Paste it into the HTML of your site where you want the search box.

If you'd rather call the API directly (custom frontend), the **Access token** card has the token and a curl example.

> **The search experience must be Active** for the widget/API to work. The detail-page header has an **Activate** button — click it once you're ready to go live. Inactive experiences exist but reject incoming traffic.

## Step 7 — (Optional) Add a chat experience

If you also want a chatbot that can answer questions over the same data:

Sidebar → **Experiences** → **New Experience** → **AI Experience**.

Fill in:

- **Name** and **slug**.
- **Description** — describe what this chat is for, in plain words. Interakt uses this in the next step to draft the system instructions.
- **Pipeline mode** — **Agentic** for free-form conversational ("the AI decides what to do"), **Deterministic** for predictable, fixed-flow chatbots ("always search, then answer"). Agentic is the right default for most assistants.

Click **Next**.

**Tools step:** pick the search/lookup/inspect/enumerate tools that were auto-created for your index. The chat needs these to fetch data when answering. (If you don't see them, go to **Capabilities → Tools** → check that they exist for your index, or to the index's data source detail page → **Create Tools**.)

**AI configuration step:**

- **System instructions** are pre-filled by AI based on your description. Read them — they're the chatbot's personality. Edit if needed.
- **Tone** — Professional, Friendly, Casual, etc. Pick one.
- **Provider/model** — leave on system default.

**Access control step:** rate limits and allowed origins. Defaults are fine for now.

Click **Create**, then activate the experience.

Test in the **Chat Playground** card on the experience detail page — type a question. The chatbot calls your search tool, retrieves data, and answers using your data.

When you're happy, embed the **Chat Widget** the same way as the search widget.

## Where to go next

- [Search indexes](../concepts/search-indexes) — what every setting on the index screens does.
- [Index fields](../concepts/index-fields) — facetable, searchable, sortable, boost, transforms — explained.
- [Display configuration](../concepts/display-configuration) — how to make search results look like real product cards.
- [Tools](../concepts/tools) — what tools are, and how to give your chat more capabilities than just search.
- [Guardrails](../concepts/guardrails) — keep the chatbot on-topic and safe.
- [Analytics](../concepts/analytics) — see what people are searching and asking, and where the chatbot struggles.
