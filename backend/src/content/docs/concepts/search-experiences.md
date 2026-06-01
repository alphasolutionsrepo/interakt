---
sidebar_position: 8
---

# Search experiences

A **search experience** is the user-facing thing your visitors interact with — a search box with filters, autocomplete, and result cards. It wraps one or more search indexes, sets the access token, decides how results are formatted, and (optionally) layers AI summaries on top.

## Where to find these screens
Sidebar → **Experiences** → filter to Search, or create from the **New Experience** button.

## Creating a search experience

The create flow is a four-step wizard.

### Step 1 — Basic info

| Field | What it controls |
|---|---|
| **Name** | Display name shown in the admin and (sometimes) to end-users in the widget. |
| **Slug** | URL path your users hit (e.g. `product-search` → `/api/v1/search-experiences/product-search/search`). Lowercase, hyphens. **Can't be changed after creation** — pick deliberately. |
| **Description** | Optional, internal. |
| **Index selection** | Pick one or more indexes. The first one defaults to **Primary**; additions default to **Secondary**. Roles can be changed; primary index gets the most weight in ranking. |

### Step 2 — Search settings

#### Pagination
- **Default page size** — how many results per page when the consumer doesn't ask for a specific number. Default 10.
- **Maximum page size** — the cap. Lets you protect the system from a misbehaving consumer asking for 100,000 results. Default 100.

#### Search features
- **Result highlighting** — when a result matches a search term, the matched text is wrapped in markers so your frontend can bold it. Default on.
- **Faceted search** — return facet counts alongside results so your UI can show filter chips with counts. Default on. Required for any kind of filter UI.

#### Autocomplete
- **Enable autocomplete** — turns on the "suggestions as the user types" feature. Default on.
- **Autocomplete mode** — Prefix-based (matches what the user is typing), Semantic (suggests semantically-related queries), Hybrid (both). Prefix is the right default.
- **Suggestion limit** — how many suggestions to show. Default 5.

#### Multi-index strategy *(only when 2+ indexes are attached)*
How results from multiple indexes are combined.

- **Union** — merge results from all indexes. Most common.
- **Intersection** — only return documents present in *all* indexes. Rare.
- **Weighted** — manual weight per index.

#### Result merge strategy *(Union + multi-index)*
How the merged results are ranked.

- **Reciprocal Rank Fusion (RRF)** — merges by relative rank, not raw scores. Robust default.
- **Score Weighted** — merges by raw relevance score. Works when the indexes are very similar.
- **Custom** — lets you mix the two using sliders.

#### Allowed origins (CORS)
A list of domains that are allowed to call this experience from a browser. Add `https://your-site.com` for production; add `http://localhost:3000` for dev. Empty means all origins allowed (fine for server-side use; bad for browser-facing).

### Step 3 — AI configuration

A toggle: **Enable AI features**. Off by default.

If on, you can layer AI summaries on top of the search results:

- **AI provider / model** — defaults to system default. Override if this experience needs a specific one.
- **Enable summary** — generate a 1–3 paragraph summary of the top results.
- **Max results for summary** — how many top results the AI sees when generating. Default 5.
- **Summary length** — Short / Medium / Long.
- **Summary tone** — Professional / Casual / Technical / Friendly.
- **Custom instructions** — free-text additional instructions for the AI ("emphasise price differences", "always include a disclaimer about availability"). The "Generate with AI" button drafts these for you from your index schema.

The summary appears in the search response as a field your frontend can render above the result list.

### Step 4 — Display configuration

How the result cards should look. See [Display configuration](display-configuration) — it's its own page because it's worth understanding properly.

Click **Create**. You land on the detail page.

## The detail page

Header has:
- Experience name, description.
- Status badges (Active / Inactive, Provider type).
- **Activate** / **Deactivate** button.
- **Edit** button.

### Stats cards
- **Indexes** count.
- **AI summary** on/off.
- **Status / Created** date.

### Search widget card *(collapsible)*

The embed configuration for the drop-in widget. See [Embed widgets](embed-widgets) for the full breakdown — theme, colours, modal vs inline, container ID, font.

### Search settings card *(read-only)*
Mirrors what you set in step 2. To change, click **Edit** in the header.

### AI configuration card *(read-only)*
Mirrors what you set in step 3.

### Access token card
- The token, masked. Click **Copy**.
- **Regenerate Token** button (in the header) — invalidates the existing one. Useful if you suspect leakage.
- A sample curl request showing how to call the API with this token.

### Allowed origins card
The CORS list, shown as badges.

### Danger zone
Delete button — confirms by requiring you to type the experience name.

## The edit screen

Same fields as the wizard, arranged into tabs:

- **Basic** — name, description. (Slug is shown but cannot be changed.)
- **Search** — every setting from step 2.
- **AI** — every setting from step 3.
- **Display** — display configuration ([details](display-configuration)).

Click **Save Changes** at the top. The button is greyed out until you actually change something.

## What you control vs what your users see

| You configure | Your users experience |
|---|---|
| Which indexes are searched | A unified result list across them |
| Multi-index strategy + merge weights | Ranking that makes sense across both |
| Default page size, max page size | The widget paginates accordingly |
| Highlighting on/off | Matching words bolded in the cards |
| Facets on/off | Filter chips on the side or top of the results |
| Autocomplete on/off | Suggestions as they type |
| AI summary on/off | A summary block above the results |
| Display configuration | The shape of each result card — title, image, price, badge |
| Allowed origins | Whether the widget loads at all on a given site |
| Active toggle | Whether search works at all |

## Multi-index in plain English

You attach a `products` index and a `support-articles` index to the same search experience. A user searches "wireless earbuds — how to pair":

- **Union + RRF** — they get a mix: top product cards plus the top "how to pair" article, intermixed by rank.
- **Intersection** — they get only items that match in both indexes. Rare.
- **Weighted Union, products 0.7 / articles 0.3** — products dominate the top, articles trickle in below.

This is good for sites where the same search box serves multiple kinds of answers.

## Common gotchas

- **The slug is in the URL — don't change it after going live.** Your frontend and widget snippet hard-code it. Renaming breaks all callers.
- **Tokens aren't shown again after regeneration.** Copy immediately.
- **CORS errors when the dev origin isn't whitelisted.** Add `http://localhost:3000` (or wherever your dev site runs) during development.
- **Multiple indexes with very different sizes don't blend well.** RRF works best when both indexes return roughly comparable counts. If one has 10k docs and the other has 50, the small one is invisible. Consider separate experiences.
- **AI summaries cost money** (or, on local models, time). Disable them on experiences with high traffic if your provider bills per token.

## Where to go next

- [Display configuration](display-configuration) — the look of result cards.
- [Embed widgets](embed-widgets) — putting the search box on your site.
- [Access tokens](access-tokens) — how the credential model works.
- [Analytics](analytics) — what people searched for and how often.
